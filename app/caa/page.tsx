import { CaaPublicEntry } from "../components/caa-shared-view";
export const metadata = { robots: { index: false,follow: false },referrer: "no-referrer" as const };
export default function SharedCaaPage() { return <CaaPublicEntry />; }
