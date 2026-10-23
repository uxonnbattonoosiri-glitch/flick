export type Status = 'todo' | 'doing' | 'done';

export const STATUSES: Status[] = ['todo', 'doing', 'done'];

export interface Task {
  id: string;
  title: string;
  status: Status;
  /** 並び順。大きいほど上。状態を変えた時刻を入れて、動かしたものが先頭に来るようにする */
  position: number;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export const TITLE_MAX = 500;
