import { Dispatch, SetStateAction } from "react";
import { themes, applicationThemes } from "./constants";

export type Theme = (typeof themes)[number];
export type ApplicationTheme = (typeof applicationThemes)[number];

export type SetterType<T> = Dispatch<SetStateAction<T>>;

export type UserProfile = {
  name: string;
  email: string;
  image?: string | null;
};
