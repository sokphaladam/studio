"use client";
import {
  CommonDialogProvider,
  useCommonDialog,
} from "@/components/common-dialog";
import { Button } from "@/components/ui/button";
import { TrashIcon } from "lucide-react";

function StorybookBody() {
  const { showDialog } = useCommonDialog();

  return (
    <div className="p-4">
      <Button
        onClick={() => {
          showDialog({
            destructive: true,
            title: "Delete Database",
            content: "Are you sure you want to delete this?",
            previewCode: "DROP DATABASE my_database",
            actions: [
              {
                text: "Delete",
                icon: TrashIcon,
                onClick: async () => {
                  await new Promise((resolve) => setTimeout(resolve, 3000));
                },
              },
            ],
          });
        }}
      >
        Show
      </Button>
    </div>
  );
}

export default function CommonDialogStorybook() {
  return (
    <CommonDialogProvider>
      <StorybookBody />
    </CommonDialogProvider>
  );
}
