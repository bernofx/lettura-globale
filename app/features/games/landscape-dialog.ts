export function landscapePoint(rect: DOMRect, x: number, y: number, rotated: boolean) {
  return rotated
    ? { x: (y - rect.top) / rect.height, y: (rect.right - x) / rect.width }
    : { x: (x - rect.left) / rect.width, y: (y - rect.top) / rect.height };
}

export function mountLandscapeDialog(element: HTMLDialogElement, cancelGesture: () => void, onFit?: (rotated: boolean) => void) {
  const viewport = window.visualViewport;
  let frame = 0;
  function fit() {
    const { width, height, offsetLeft, offsetTop, scale } = viewport ?? {
      width: window.innerWidth, height: window.innerHeight, offsetLeft: 0, offsetTop: 0, scale: 1,
    };
    if (width <= 0 || height <= 0 || scale <= 0) return;
    const rotated = width < height;
    element.dataset.rotated = String(rotated);
    element.style.setProperty("--game-viewport-width", (rotated ? height : width) * scale + "px");
    element.style.setProperty("--game-viewport-height", (rotated ? width : height) * scale + "px");
    const left = offsetLeft + (rotated ? width : 0);
    element.style.transform = "translate(" + left + "px, " + offsetTop + "px) scale(" + 1 / scale + ")" + (rotated ? " rotate(90deg)" : "");
    onFit?.(rotated);
  }
  function scheduleFit() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      cancelGesture();
      fit();
    });
  }
  fit();
  element.showModal();
  viewport?.addEventListener("resize", scheduleFit);
  viewport?.addEventListener("scroll", scheduleFit);
  window.addEventListener("resize", scheduleFit);
  window.addEventListener("blur", cancelGesture);
  return () => {
    element.close();
    cancelAnimationFrame(frame);
    viewport?.removeEventListener("resize", scheduleFit);
    viewport?.removeEventListener("scroll", scheduleFit);
    window.removeEventListener("resize", scheduleFit);
    window.removeEventListener("blur", cancelGesture);
  };
}
