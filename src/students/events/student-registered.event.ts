export class StudentRegisteredEvent {
  constructor(
    public readonly studentId: string,
    public readonly ref: string,
    public readonly fullName: string,
    public readonly email: string,
    public readonly batch: string,
    public readonly status: string,
    public readonly enrollmentDate: string,
    public readonly modules: Array<{ id: string; code: string; name: string }>,
  ) {}
}
