import { useState } from "react";
import type { Exercise, LibraryItem, Sequence, Therapist } from "../../shared/types";
import type { AppData } from "../app-state/use-app-data";
import type { useCloudSync } from "../app-state/use-cloud-sync";
import { categoryImageError } from "../../domain/category-images";
import { canAccessSequence, canEditSequence, removeExerciseFromOwnedSequences } from "../../domain/sequence-access";
import { canRestoreStepOrder } from "../../domain/sequence-step-merge";
import { copyExerciseForSequence } from "../../domain/sequence-exercise-editor";
import { differentExerciseSettings } from "../../domain/exercise-edit-version";

type Props = {
  data: AppData; cloud: ReturnType<typeof useCloudSync>; therapist?: Therapist;
  activeSequence?: Sequence; visibleSequences: Sequence[]; visibleLibrary: LibraryItem[];
  editingExercise: Exercise | null; setEditingExercise: (exercise: Exercise | null) => void; setShowBuilder: (open: boolean) => void;
  pendingExerciseDelete: Exercise | null; setPendingExerciseDelete: (exercise: Exercise | null) => void;
  notify: (message: string) => void;
};

export function useSequenceExerciseEditor({ data, cloud, therapist, activeSequence, visibleSequences, visibleLibrary,
  editingExercise, setEditingExercise, setShowBuilder, pendingExerciseDelete, setPendingExerciseDelete, notify }: Props) {
  const { exercises, setExercises, setSequences, categorySymbols } = data;
  const [editingStep, setEditingStep] = useState<{ sequence: Sequence; slot: number; adultId: string } | null>(null);
  const stepSequence = editingStep && visibleSequences.find(seq => seq.id === editingStep.sequence.id);
  const stepAvailable = !editingStep || (cloud.copyEditorReady && editingStep.adultId === therapist?.id && stepSequence &&
    JSON.stringify(stepSequence.exerciseIds) === JSON.stringify(editingStep.sequence.exerciseIds));
  const currentEditedExercise = stepAvailable && editingExercise && (!editingExercise.sequenceId ||
    visibleSequences.some(sequence => sequence.id === editingExercise.sequenceId && sequence.exerciseIds.includes(editingExercise.id)))
    ? exercises.find(exercise => exercise.id === editingExercise.id && !exercise.deleted) : undefined;
  const canManageSequence = Boolean(activeSequence && canEditSequence(activeSequence.therapistId, therapist?.id, therapist?.role));
  const canEditActiveSequence = canManageSequence || Boolean(activeSequence && cloud.copyEditorReady);
  const otherSequence = editingStep && editingExercise && !editingExercise.sequenceId && visibleSequences.find(seq =>
    seq.id !== editingStep.sequence.id && seq.exerciseIds.includes(editingExercise.id));
  const editNotice = editingStep
    ? (otherSequence ? `Questo esercizio è usato anche in «${otherSequence.title}». ` : "") + `La modifica vale solo per «${editingStep.sequence.title}», dal prossimo avvio.`
    : editingExercise && !editingExercise.sequenceId ? "Stai modificando il modello. Le sequenze che lo usano ancora direttamente riceveranno la modifica." : undefined;
  const openExercise = (exercise: Exercise | null) => {
    setEditingStep(null);
    setEditingExercise(exercise);
    setShowBuilder(true);
  };
  const openStep = (sequence: Sequence, slot: number) => {
    const exercise = exercises.find(item => item.id === sequence.exerciseIds[slot] && !item.deleted);
    if (!exercise || !therapist) return;
    setEditingStep({ sequence, slot, adultId: therapist.id });
    setEditingExercise(exercise);
    setShowBuilder(true);
  };
  const addModel = (model: Exercise, create: boolean) => {
    if (!therapist) return;
    const authored = create && cloud.copyEditorReady ? { ...model, ownerAdultId: therapist.id } : model;
    const sequence = canEditActiveSequence ? activeSequence : undefined;
    const step = sequence && cloud.copyEditorReady ? copyExerciseForSequence(authored, sequence.id, therapist.id) : authored;
    const added = create ? [authored] : [];
    if (step !== authored) added.push(step);
    if (added.length) setExercises(current => [...added, ...current]);
    if (sequence) changeSequenceSteps(sequence, [...sequence.exerciseIds, step.id]);
  };
  const saveExercise = (exercise: Exercise) => {
    const error = categoryImageError(exercise, visibleLibrary, categorySymbols);
    if (error) { notify(error); return; }
    if (editingExercise && !currentEditedExercise) return;
    if (editingStep && (!stepSequence || !stepAvailable || !therapist)) return;
    if (!editingExercise) {
      addModel(exercise, true);
      notify(canEditActiveSequence ? "Esercizio creato e aggiunto alla sequenza" : "Esercizio creato");
    } else if (currentEditedExercise && !differentExerciseSettings(exercise, currentEditedExercise).length) {
      notify("Nessuna modifica da salvare");
    } else if (editingStep && stepSequence && therapist && !exercise.sequenceId) {
      const copy = copyExerciseForSequence(exercise, stepSequence.id, therapist.id);
      const ids = [...stepSequence.exerciseIds];
      ids[editingStep.slot] = copy.id;
      setExercises(current => [...current, copy]);
      changeSequenceSteps(stepSequence, ids);
      notify("Passo aggiornato nella sequenza");
    } else {
      setExercises(current => current.map(item => item.id === exercise.id ? exercise : item));
      notify("Esercizio aggiornato");
    }
    setShowBuilder(false);
    setEditingExercise(null);
    setEditingStep(null);
  };
  const duplicateExercise = (displayed: Exercise) => {
    const model = exercises.find(item => item.id === displayed.id && !item.deleted && !item.sequenceId);
    if (!model) return;
    addModel({ ...model, id: crypto.randomUUID(), ownerAdultId: undefined, title: `${model.title} (copia)`, updatedAt: new Date().toISOString() }, true);
    notify(canEditActiveSequence ? "Esercizio duplicato nella sequenza" : "Esercizio duplicato");
  };
  const deleteExercise = async () => {
    if (!pendingExerciseDelete) return;
    const id = pendingExerciseDelete.id;
    if (cloud.copyEditorReady && visibleSequences.some(seq => seq.exerciseIds.includes(id))) {
      setPendingExerciseDelete(null);
      notify("Prima di eliminare il modello, rimuovilo dalle sequenze che lo usano direttamente.");
      return;
    }
    const pendingCopies = cloud.copyEditorReady && cloud.pendingChange()?.collections.exercises?.upserts.some(row => row.templateExerciseId === id);
    if (pendingCopies && !await persistBeforeDetach()) return;
    setExercises((current) => current.map((exercise) => exercise.id === id ? { ...exercise, deleted: true, updatedAt: new Date().toISOString() } : exercise));
    const updatedAt = new Date().toISOString();
    if (!cloud.copyEditorReady) setSequences((current) => removeExerciseFromOwnedSequences(current, id, therapist?.id, therapist?.role, updatedAt));
    setPendingExerciseDelete(null);
    notify("Esercizio rimosso; lo storico delle sessioni è stato conservato");
  };
  const persistBeforeDetach = async () => {
    try {
      if (navigator.onLine && cloud.hasBaseline()) {
        await cloud.saveNow();
        return true;
      }
    } catch { /* Keep the local step and its pending edit together. */ }
    notify("La modifica del passo è ancora sul dispositivo. Riprova a rimuoverlo dopo la sincronizzazione.");
    return false;
  };
  const unsavedCopy = (sequence: Sequence, kept: string[]) => {
    const removed = sequence.exerciseIds.filter(id => !kept.includes(id));
    return removed.length > 0 && cloud.pendingChange()?.collections.exercises?.upserts.some(row =>
      row.sequenceId === sequence.id && removed.includes(row.id));
  };
  const canDetachSteps = async (sequence: Sequence, kept: string[]) =>
    !cloud.copyEditorReady || !unsavedCopy(sequence, kept) || await persistBeforeDetach();
  const changeSequenceSteps = async (reviewed: Sequence, exerciseIds: string[]) => {
    if (cloud.copyEditorReady && unsavedCopy(reviewed, exerciseIds) && !await persistBeforeDetach()) return;
    setSequences(current => current.map(sequence => {
      if (sequence.id !== reviewed.id || sequence.deleted || !(cloud.copyEditorReady ? canAccessSequence : canEditSequence)(sequence.therapistId, therapist?.id, therapist?.role) ||
        JSON.stringify(sequence.exerciseIds) !== JSON.stringify(reviewed.exerciseIds)) return sequence;
      return { ...sequence, exerciseIds, updatedAt: new Date().toISOString() };
    }));
  };
  const restoreStepOrder = (reviewed: Sequence, order: string[]) => {
    if (canRestoreStepOrder(reviewed.exerciseIds, order)) changeSequenceSteps(reviewed, order);
  };
  return { canManageSequence, canEditActiveSequence, editNotice, currentEditedExercise, addModel, saveExercise,
    duplicateExercise, deleteExercise, changeSequenceSteps, restoreStepOrder, openStep, openExercise, canDetachSteps };
}
