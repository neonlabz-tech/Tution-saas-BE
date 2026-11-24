export enum TeacherStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum ModuleStatus {
  ACTIVE = 'active',
  UPCOMING = 'upcoming',
  ARCHIVED = 'archived',
}

export enum ClassStatus {
  SCHEDULED = 'scheduled',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ClassType {
  ONLINE = 'online',
  PHYSICAL = 'physical',
}

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  LATE = 'late',
  EXCUSED = 'excused',
}

export enum TxType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

export enum NoticePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum NoticeStatus {
  PUBLISHED = 'published',
  DRAFT = 'draft',
}

/** Computed from status + publish/expiry dates; never stored. */
export enum NoticeState {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  EXPIRED = 'expired',
}
