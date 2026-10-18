import type { Workspace } from "./budget-model.ts";

/** Repair the old category fallback using comments already saved by the JEMS import. */
export function restoreJemsLabels(workspace:Workspace):Workspace {
  let changed=false;
  const budgetLines=workspace.budgetLines.map(line=>{
    const comments=line.comments?.trim();
    if(!line.externalKey?.startsWith("jems:")||line.jemsLabelSource||!comments)return line;
    const reference=line.reference;
    // Preserve explicit descriptions and labels edited by the user.
    if(!reference||reference.description!==reference.category)return line;
    const updateLabel=line.description===reference.description;
    changed=true;
    return {...line,jemsLabelSource:"comments" as const,description:updateLabel?comments:line.description,reference:{...reference,description:comments}};
  });
  return changed?{...workspace,budgetLines}:workspace;
}
