export interface GridFilterItem {
  field: string;
  operator?: string;
  value?: unknown;
}

export interface GridFilterModel {
  items?: GridFilterItem[];
  quickFilterValues?: string[];
  logicOperator?: 'and' | 'or';
}

export interface QuickFilterField {
  field: string;
  type: 'string' | 'number' | 'boolean';
  transform?: (value: string) => Record<string, unknown>;
}

export interface QuickFilterConfig {
  fields: QuickFilterField[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseFilterModel(
  raw?: GridFilterModel | string,
): GridFilterModel | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as GridFilterModel;
    } catch {
      return { quickFilterValues: [raw] };
    }
  }
  return raw;
}

export function buildFilterQuery(
  rawFilterModel: GridFilterModel | string | undefined,
  config: QuickFilterConfig,
): Record<string, unknown> {
  const filterModel = parseFilterModel(rawFilterModel);
  if (!filterModel) return {};

  const andConditions: Record<string, unknown>[] = [];

  if (Array.isArray(filterModel.quickFilterValues)) {
    for (const rawTerm of filterModel.quickFilterValues) {
      const term = String(rawTerm ?? '').trim();
      if (!term) continue;

      const regex = escapeRegex(term);
      const orConditions = config.fields.map((f) => {
        if (f.transform) {
          return f.transform(regex);
        }
        return { [f.field]: { $regex: regex, $options: 'i' } };
      });

      if (orConditions.length > 0) {
        andConditions.push({ $or: orConditions });
      }
    }
  }

  if (Array.isArray(filterModel.items)) {
    for (const item of filterModel.items) {
      if (!item.field || item.value === undefined || item.value === '') continue;
      if (typeof item.value === 'string') {
        const regex = escapeRegex(item.value.trim());
        if (item.operator === 'equals') {
          andConditions.push({ [item.field]: item.value.trim() });
        } else {
          andConditions.push({ [item.field]: { $regex: regex, $options: 'i' } });
        }
      } else {
        andConditions.push({ [item.field]: item.value });
      }
    }
  }

  if (andConditions.length === 0) return {};
  if (andConditions.length === 1) return andConditions[0];
  return { $and: andConditions };
}
