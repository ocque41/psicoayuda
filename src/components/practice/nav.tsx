import { WorkspaceNav } from "@/components/workspace/nav";
import { PracticeGuide } from "./practice-guide";
export function PracticeNav() {
  return (
    <>
      <WorkspaceNav audience="professional" className="practice-nav" />
      <PracticeGuide />
    </>
  );
}
