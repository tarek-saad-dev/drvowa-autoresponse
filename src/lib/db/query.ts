import sql, {
  type IResult,
  type ISqlTypeFactory,
  type ISqlTypeWithLength,
  type ISqlTypeWithNoParams,
  type ISqlTypeWithPrecisionScale,
  type ISqlTypeWithScale,
  type ISqlTypeWithTvpType,
} from "mssql";

import { getPool } from "./pool";
import { DbError, toDbError } from "./errors";

export type SqlType =
  | ISqlTypeFactory
  | ISqlTypeWithNoParams
  | ISqlTypeWithLength
  | ISqlTypeWithScale
  | ISqlTypeWithPrecisionScale
  | ISqlTypeWithTvpType;

export type QueryInput = {
  name: string;
  type: SqlType;
  value: unknown;
};

/**
 * Runs a parameterized query against the shared pool.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  inputs: QueryInput[] = [],
): Promise<IResult<T>> {
  try {
    const pool = await getPool();
    const request = pool.request();

    for (const input of inputs) {
      request.input(input.name, input.type as never, input.value);
    }

    return await request.query<T>(text);
  } catch (error) {
    throw toDbError(error, "Database query failed");
  }
}

/**
 * Runs a parameterized batch (multiple statements) against the shared pool.
 */
export async function batch(
  text: string,
  inputs: QueryInput[] = [],
): Promise<IResult<unknown>> {
  try {
    const pool = await getPool();
    const request = pool.request();

    for (const input of inputs) {
      request.input(input.name, input.type as never, input.value);
    }

    return await request.batch(text);
  } catch (error) {
    throw toDbError(error, "Database batch failed");
  }
}

/**
 * Runs a parameterized statement and returns total rowsAffected.
 */
export async function execute(
  text: string,
  inputs: QueryInput[] = [],
): Promise<number> {
  const result = await query(text, inputs);
  return result.rowsAffected.reduce((sum, n) => sum + n, 0);
}

export type TransactionClient = {
  query: <T = Record<string, unknown>>(
    text: string,
    inputs?: QueryInput[],
  ) => Promise<IResult<T>>;
  execute: (text: string, inputs?: QueryInput[]) => Promise<number>;
};

/**
 * Runs work inside a SQL Server transaction.
 * Nested query/execute helpers are bound to the same transaction.
 */
export async function withTransaction<T>(
  fn: (trx: TransactionClient) => Promise<T>,
): Promise<T> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();
  } catch (error) {
    throw toDbError(error, "Failed to begin database transaction");
  }

  const trxQuery = async <TRow = Record<string, unknown>>(
    text: string,
    inputs: QueryInput[] = [],
  ): Promise<IResult<TRow>> => {
    try {
      const request = new sql.Request(transaction);
      for (const input of inputs) {
        request.input(input.name, input.type as never, input.value);
      }
      return await request.query<TRow>(text);
    } catch (error) {
      throw toDbError(error, "Database query failed");
    }
  };

  const trx: TransactionClient = {
    query: trxQuery,
    execute: async (text, inputs = []) => {
      const result = await trxQuery(text, inputs);
      return result.rowsAffected.reduce((sum, n) => sum + n, 0);
    },
  };

  try {
    const value = await fn(trx);
    await transaction.commit();
    return value;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // Ignore rollback failures; surface the original error.
    }
    if (error instanceof DbError) {
      throw error;
    }
    throw toDbError(error, "Database transaction failed");
  }
}

export { sql };
