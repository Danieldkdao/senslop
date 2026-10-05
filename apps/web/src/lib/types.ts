import { Dispatch, SetStateAction } from "react";
import { themes } from "./constants";

export type Theme = (typeof themes)[number];

export type SetterType<T> = Dispatch<SetStateAction<T>>;

export type UserProfile = {
  name: string;
  email: string;
  image?: string | null;
};
