/**
 * scc stands for Studio Core Command. It is a collection of commands that are
 * available to Outerbase Studio.
 */

import builtinOpenERDTab from "../builtin-tab/open-erd-tab";
import builtinMassDropTableTab from "../builtin-tab/open-mass-drop-table";
import builtinOpenQueryTab from "../builtin-tab/open-query-tab";
import builtinOpenSchemaTab from "../builtin-tab/open-schema-tab";
import builtinOpenTableTab from "../builtin-tab/open-table-tab";
import builtinOpenTriggerTab from "../builtin-tab/open-trigger-tab";

export const scc = {
  tabs: {
    openUserDefinedTab: () => {},
    openBuiltinQuery: builtinOpenQueryTab,
    openBuiltinTable: builtinOpenTableTab,
    openBuiltinSchema: builtinOpenSchemaTab,
    openBuiltinTrigger: builtinOpenTriggerTab,
    openBuiltinERD: builtinOpenERDTab,
    openBuiltinMassDropTable: builtinMassDropTableTab,

    close: (keys: string[]) => {
      if (window.outerbaseCloseTab) {
        window.outerbaseCloseTab(keys);
      }
    },
  },
};
