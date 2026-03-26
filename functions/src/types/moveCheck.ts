export type MoveCheckUnwrittenRow = {
  id: string;
  helper_email: string | null;
  status: string | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  user_name: string | null;
  helper_name: string | null;
  haisha: string | null;
  task: string | null;
  summary: string | null;
  [key: string]: unknown;
};

export type MoveCheckUnwrittenItem = {
  taskId: string;
  helperEmail: string;
  serviceDate: string;
  startTime: string;
  endTime: string;
  userName: string;
  helperName: string;
  haisha: string;
  task: string;
  summary: string;
  raw: MoveCheckUnwrittenRow;
};

export type MoveCheckLogRow = {
  id: string;
  schedule_task_id: string;
  checkpoint_type: string;
  checkpoint_label: string;
  checked_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  helper_email: string;
  created_at: string | null;
};

export type MoveCheckLogItem = {
  id: string;
  scheduleTaskId: string;
  checkpointType: string;
  checkpointLabel: string;
  checkedAt: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  helperEmail: string;
  createdAt: string;
  raw: MoveCheckLogRow;
};

export type CreateMoveCheckLogParams = {
  scheduleTaskId: string;
  checkpointType: string;
  checkpointLabel: string;
  checkedAt: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  helperEmail: string;
};

export type MoveCheckLogRequestBody = {
  schedule_task_id?: unknown;
  checkpoint_type?: unknown;
  checkpoint_label?: unknown;
  checked_at?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  accuracy?: unknown;
  helper_email?: unknown;
};

export type MoveCheckUnwrittenSuccessResponse = {
  ok: true;
  helperEmail: string;
  items: MoveCheckUnwrittenItem[];
};

export type MoveCheckLogsSuccessResponse = {
  ok: true;
  taskId: string;
  items: MoveCheckLogItem[];
};

export type MoveCheckLogCreateSuccessResponse = {
  ok: true;
  item: MoveCheckLogItem;
};

export type MoveCheckErrorResponse = {
  ok: false;
  message: string;
};
