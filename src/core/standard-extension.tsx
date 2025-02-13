/**
 * This contains the standard extensions as a base for all databases.
 */

import QueryHistoryConsoleLogExtension from "@/extensions/query-console-log";
import ViewEditorExtension from "@/extensions/view-editor";

export function createStandardExtensions() {
  return [new QueryHistoryConsoleLogExtension(), new ViewEditorExtension()];
}
