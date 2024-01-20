import TextCell from "@/app/(components)/Cells/TextCell";
import OptimizeTable, {
  OptimizeTableHeaderProps,
} from "@/app/(components)/OptimizeTable";
import { openContextMenuFromEvent } from "@/messages/openContextMenu";
import * as hrana from "@libsql/hrana-client";
import { LucideKey } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

interface ResultTableProps {
  data: hrana.RowsResult;
  primaryKey?: string[];
  tableName?: string;
}

export default function ResultTable({
  data,
  tableName,
  primaryKey,
}: ResultTableProps) {
  const [selectedRowsIndex, setSelectedRowsIndex] = useState<number[]>([]);
  const [stickyHeaderIndex, setStickHeaderIndex] = useState<number>();

  const handleSelectedRowsChange = (selectedRows: number[]) => {
    setSelectedRowsIndex(selectedRows);
  };

  const headerMemo = useMemo(() => {
    return data.columnNames.map(
      (header, idx) =>
        ({
          name: header || "",
          resizable: true,
          initialSize: Math.max((header ?? "").length * 10, 150),
          icon: (primaryKey ?? []).includes(header ?? "") ? (
            <LucideKey className="w-4 h-4 text-red-500" />
          ) : undefined,
          onContextMenu: openContextMenuFromEvent([
            {
              title: "Pin Header",
              type: "check",
              checked: stickyHeaderIndex === idx,
              onClick: () => {
                setStickHeaderIndex(
                  idx === stickyHeaderIndex ? undefined : idx
                );
              },
            },
          ]),
        } as OptimizeTableHeaderProps)
    );
  }, [data, primaryKey, stickyHeaderIndex, tableName]);

  const renderCell = useCallback(
    (y: number, x: number) => {
      if (data.rows[y]) {
        return <TextCell value={data.rows[y][x] as string} />;
      }
      return <TextCell value={""} />;
    },
    [data]
  );

  return (
    <OptimizeTable
      stickyHeaderIndex={stickyHeaderIndex}
      headers={headerMemo}
      data={data.rows}
      renderAhead={20}
      renderCell={renderCell}
      rowHeight={35}
      selectedRowsIndex={selectedRowsIndex}
      onSelectedRowsIndexChanged={handleSelectedRowsChange}
    />
  );
}
