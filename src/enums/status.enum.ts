export enum TeacherStatus {
  ACTIVE = 'active',
  ON_LEAVE = 'on-leave',
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
