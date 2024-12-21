import {
  DatabaseSchemas,
  DatabaseTableSchema,
  DatabaseTriggerSchema,
  DriverFlags,
  DatabaseSchemaItem,
  DatabaseTableColumn,
  TableColumnDataType,
  DatabaseTableSchemaChange,
  ColumnTypeSelector,
  DatabaseTableColumnConstraint,
  DatabaseSchemaChange,
} from "../base-driver";
import CommonSQLImplement from "../common-sql-imp";
import { escapeSqlValue } from "../sqlite/sql-helper";
import {
  generateMysqlDatabaseSchema,
  generateMySqlSchemaChange,
} from "./generate-schema";
import {
  MYSQL_COLLATION_LIST,
  MYSQL_DATA_TYPE_SUGGESTION,
} from "./mysql-data-type";

interface MySqlDatabase {
  SCHEMA_NAME: string;
}

interface MySqlColumn {
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  EXTRA: string;
  COLUMN_KEY: string;
  DATA_TYPE: string;
  IS_NULLABLE: "YES" | "NO";
  COLUMN_COMMENT: string;
  CHARACTER_MAXIMUM_LENGTH: number;
  NUMERIC_PRECISION: number;
  NUMERIC_SCALE: number;
  COLUMN_DEFAULT: string | null;
  COLUMN_TYPE: string;
  COLLATION_NAME: string | null;
}

interface MySqlTable {
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  TABLE_TYPE: string;
  INDEX_LENGTH: number;
  DATA_LENGTH: number;
}

interface MySQLConstraintResult {
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  CONSTRAINT_NAME: string;
  CONSTRAINT_TYPE: string;
}

export interface MySQLConstraintColumnResult {
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  CONSTRAINT_NAME: string;
  REFERENCED_TABLE_SCHEMA: string;
  REFERENCED_TABLE_NAME: string;
  REFERENCED_COLUMN_NAME: string;
}

export interface MySQLTriggerResult {
  TRIGGER_NAME: string;
  EVENT_OBJECT_SCHEMA: string;
  EVENT_OBJECT_TABLE: string;
  ACTION_TIMING: string;
  ACTION_STATEMENT: string;
  TRIGGER_SCHEMA: string;
}

function mapColumn(column: MySqlColumn): DatabaseTableColumn {
  const result: DatabaseTableColumn = {
    name: column.COLUMN_NAME,
    type: column.COLUMN_TYPE,
    constraint: undefined,
  };

  if (column.IS_NULLABLE === "NO") {
    result.constraint = {
      ...result.constraint,
      notNull: true,
    };
  }

  if (column.COLUMN_KEY === "PRI") {
    result.constraint = {
      ...result.constraint,
      primaryKey: true,
    };
  }

  if (column.COLUMN_DEFAULT === null && column.IS_NULLABLE === "YES") {
    result.constraint = {
      ...result.constraint,
      defaultExpression: "NULL",
    };
  } else if (column.COLUMN_DEFAULT !== null) {
    result.constraint = {
      ...result.constraint,
      defaultValue: column.COLUMN_DEFAULT,
    };
  }

  if (column.COLLATION_NAME) {
    result.constraint = {
      ...result.constraint,
      collate: column.COLLATION_NAME,
    };
  }

  return result;
}

export default abstract class MySQLLikeDriver extends CommonSQLImplement {
  columnTypeSelector: ColumnTypeSelector = MYSQL_DATA_TYPE_SUGGESTION;

  escapeId(id: string) {
    return `\`${id.replace(/`/g, "``")}\``;
  }

  escapeValue(value: unknown): string {
    return escapeSqlValue(value);
  }

  getFlags(): DriverFlags {
    return {
      defaultSchema: "",
      optionalSchema: false,
      supportBigInt: false,
      supportModifyColumn: true,
      mismatchDetection: false,
      supportCreateUpdateTable: true,
      supportCreateUpdateDatabase: true,
      dialect: "mysql",

      supportUseStatement: true,
      supportRowId: false,
      supportInsertReturning: false,
      supportUpdateReturning: false,
    };
  }

  getCollationList(): string[] {
    return MYSQL_COLLATION_LIST;
  }

  async getCurrentSchema(): Promise<string | null> {
    const result = (await this.query("SELECT DATABASE() AS db")) as unknown as {
      rows: { db?: string | null }[];
    };

    return result.rows[0].db!;
  }

  async schemas(): Promise<DatabaseSchemas> {
    const schemaSql =
      "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')";
    const schemaResult = (await this.query(schemaSql))
      .rows as unknown as MySqlDatabase[];

    const tableSql =
      "SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, DATA_LENGTH, INDEX_LENGTH FROM information_schema.tables WHERE TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')";
    const tableResult = (await this.query(tableSql))
      .rows as unknown as MySqlTable[];

    const columnSql =
      "SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, DATA_TYPE, EXTRA, COLUMN_KEY, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.columns WHERE TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')";
    const columnResult = (await this.query(columnSql))
      .rows as unknown as MySqlColumn[];

    const constraintSql =
      "SELECT TABLE_SCHEMA, TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.table_constraints WHERE TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys') AND CONSTRAINT_TYPE IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')";
    const constraintResult = (await this.query(constraintSql))
      .rows as unknown as MySQLConstraintResult[];

    const constraintColumnsSql = `SELECT CONSTRAINT_NAME, TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_SCHEMA, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.key_column_usage WHERE TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')`;
    const constraintColumnsResult = (await this.query(constraintColumnsSql))
      .rows as unknown as MySQLConstraintColumnResult[];

    const triggerSql = "SELECT * FROM information_schema.triggers";
    const triggerResult = (await this.query(triggerSql))
      .rows as unknown as MySQLTriggerResult[];

    // Hash table of schema
    const schemaRecord: Record<string, DatabaseSchemaItem[]> = {};
    for (const s of schemaResult) {
      schemaRecord[s.SCHEMA_NAME] = [];
    }

    // Hash table of table
    const tableRecord: Record<string, DatabaseSchemaItem> = {};
    for (const t of tableResult) {
      const key = t.TABLE_SCHEMA + "." + t.TABLE_NAME;
      const table: DatabaseSchemaItem = {
        name: t.TABLE_NAME,
        type: t.TABLE_TYPE === "VIEW" ? "view" : "table",
        tableName: t.TABLE_NAME,
        schemaName: t.TABLE_SCHEMA,
        tableSchema: {
          stats: {
            sizeInByte: t.DATA_LENGTH + t.INDEX_LENGTH,
          },
          autoIncrement: false,
          pk: [],
          columns: [],
          tableName: t.TABLE_NAME,
          schemaName: t.TABLE_SCHEMA,
        },
      };

      tableRecord[key] = table;
      if (schemaRecord[t.TABLE_SCHEMA]) {
        schemaRecord[t.TABLE_SCHEMA].push(table);
      }
    }

    for (const c of columnResult) {
      const column: DatabaseTableColumn = mapColumn(c);
      const tableKey = c.TABLE_SCHEMA + "." + c.TABLE_NAME;
      const tableSchema = tableRecord[tableKey].tableSchema;
      if (tableSchema) {
        tableSchema.columns.push(column);
      }
    }

    // Add constraint
    const constraintRecords: Record<string, DatabaseTableColumnConstraint> = {};

    for (const c of constraintResult) {
      const constraintKey =
        c.TABLE_SCHEMA + "." + c.TABLE_NAME + "." + c.CONSTRAINT_NAME;

      const tableKey = c.TABLE_SCHEMA + "." + c.TABLE_NAME;
      const table = tableRecord[tableKey];

      if (table && table.tableSchema) {
        const constraint: DatabaseTableColumnConstraint = {
          name: c.CONSTRAINT_NAME,
        };

        if (c.CONSTRAINT_TYPE === "PRIMARY KEY") {
          constraint.primaryKey = true;
          constraint.primaryColumns = [];
        }

        if (c.CONSTRAINT_TYPE === "UNIQUE") {
          constraint.unique = true;
          constraint.uniqueColumns = [];
        }

        if (c.CONSTRAINT_TYPE === "FOREIGN KEY") {
          constraint.foreignKey = {
            columns: [],
            foreignColumns: [],
            foreignSchemaName: "",
            foreignTableName: "",
          };
        }

        table.tableSchema.constraints = [
          ...(table.tableSchema?.constraints ?? []),
          constraint,
        ];

        constraintRecords[constraintKey] = constraint;
      }
    }

    // Add columns to constraint
    for (const c of constraintColumnsResult) {
      const constraintKey =
        c.TABLE_SCHEMA + "." + c.TABLE_NAME + "." + c.CONSTRAINT_NAME;

      const tableKey = c.TABLE_SCHEMA + "." + c.TABLE_NAME;
      const tableSchema = tableRecord[tableKey]?.tableSchema;

      const constraint = constraintRecords[constraintKey];

      if (constraint && tableSchema) {
        if (constraint.primaryKey) {
          constraint.primaryColumns?.push(c.COLUMN_NAME);
          const column = tableSchema.columns.find(
            (col) => col.name === c.COLUMN_NAME
          );
          if (column) column.pk = true;
        }

        if (constraint.unique) {
          constraint.uniqueColumns?.push(c.COLUMN_NAME);
        }

        if (constraint.foreignKey) {
          constraint.foreignKey.columns?.push(c.COLUMN_NAME);
          constraint.foreignKey.foreignColumns?.push(c.REFERENCED_COLUMN_NAME);
          constraint.foreignKey.foreignSchemaName = c.REFERENCED_TABLE_SCHEMA;
          constraint.foreignKey.foreignTableName = c.REFERENCED_TABLE_NAME;
        }
      }
    }

    // Add triggers
    for (const s of schemaResult) {
      const triggers = triggerResult
        .filter((f) => f.TRIGGER_SCHEMA === s.SCHEMA_NAME)
        .map((t) => {
          return {
            name: t.TRIGGER_NAME,
            tableName: t.EVENT_OBJECT_TABLE,
            schemaName: t.EVENT_OBJECT_SCHEMA,
            timing: t.ACTION_TIMING,
            statement: t.ACTION_STATEMENT,
            type: "trigger",
          };
        });
      schemaRecord[s.SCHEMA_NAME] = schemaRecord[s.SCHEMA_NAME].concat(
        triggers as DatabaseSchemaItem[]
      );
    }

    return schemaRecord;
  }

  async tableSchema(
    schemaName: string,
    tableName: string
  ): Promise<DatabaseTableSchema> {
    const columnSql = `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, DATA_TYPE, EXTRA, COLUMN_KEY, IS_NULLABLE, COLUMN_DEFAULT, COLLATION_NAME FROM information_schema.columns WHERE TABLE_NAME=${escapeSqlValue(tableName)} AND TABLE_SCHEMA=${escapeSqlValue(schemaName)} ORDER BY ORDINAL_POSITION`;
    const columnResult = (await this.query(columnSql))
      .rows as unknown as MySqlColumn[];

    const autoIncrement = columnResult.some(
      (c) => c.EXTRA === "auto_increment"
    );

    const constraintSql = `SELECT TABLE_SCHEMA, TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.table_constraints WHERE TABLE_SCHEMA = ${this.escapeValue(schemaName)} AND TABLE_NAME = ${this.escapeValue(tableName)} AND CONSTRAINT_TYPE IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')`;
    const constraintResult = (await this.query(constraintSql))
      .rows as unknown as MySQLConstraintResult[];

    const constraintColumnsSql = `SELECT CONSTRAINT_NAME, TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_SCHEMA, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.key_column_usage WHERE TABLE_SCHEMA = ${this.escapeValue(schemaName)} AND TABLE_NAME = ${this.escapeValue(tableName)}`;
    const constraintColumnsResult = (await this.query(constraintColumnsSql))
      .rows as unknown as MySQLConstraintColumnResult[];

    const columns: DatabaseTableColumn[] = columnResult.map(mapColumn);

    const constraints: DatabaseTableColumnConstraint[] = constraintResult.map(
      (constraint) => {
        const columnList = constraintColumnsResult.filter(
          (column) => column.CONSTRAINT_NAME === constraint.CONSTRAINT_NAME
        );

        if (constraint.CONSTRAINT_TYPE === "PRIMARY KEY") {
          // Marking column as pk
          const primaryColumns = columnList.map((c) => c.COLUMN_NAME);
          const primarySet = new Set(primaryColumns);

          columns.forEach((col) => {
            if (primarySet.has(col.name)) {
              col.pk = true;
            }
          });

          return {
            name: constraint.CONSTRAINT_NAME,
            primaryKey: true,
            primaryColumns: columnList.map((c) => c.COLUMN_NAME),
          } as DatabaseTableColumnConstraint;
        }

        return {
          name: constraint.CONSTRAINT_NAME,
          primaryKey: constraint.CONSTRAINT_TYPE === "PRIMARY KEY",
          unique: constraint.CONSTRAINT_TYPE === "UNIQUE",
          foreignKey:
            constraint.CONSTRAINT_TYPE === "FOREIGN KEY"
              ? {
                  columns: columnList.map((c) => c.COLUMN_NAME),
                  foreignColumns: columnList.map(
                    (c) => c.REFERENCED_COLUMN_NAME
                  ),
                  foreignSchemaName: columnList[0].REFERENCED_TABLE_SCHEMA,
                  foreignTableName: columnList[0].REFERENCED_TABLE_NAME,
                }
              : undefined,
        };
      }
    );

    const pk = columnResult
      .filter((c) => c.COLUMN_KEY === "PRI")
      .map((c) => c.COLUMN_NAME);

    return {
      autoIncrement,
      pk,
      tableName,
      schemaName,
      constraints,
      columns,
    };
  }

  trigger(): Promise<DatabaseTriggerSchema> {
    throw new Error("Not implemented");
  }

  createUpdateTableSchema(change: DatabaseTableSchemaChange): string[] {
    return generateMySqlSchemaChange(this, change);
  }

  createUpdateDatabaseSchema(change: DatabaseSchemaChange): string[] {
    return generateMysqlDatabaseSchema(this, change);
  }

  inferTypeFromHeader(): TableColumnDataType | undefined {
    return undefined;
  }
}
