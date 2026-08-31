import { z } from "zod";

export const genderEnum = ["MALE", "FEMALE"] as const;

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.string().trim().email("Enter a valid email address."),
  gender: z.enum(genderEnum, { message: "Select your gender." }).optional(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const warehouseCodeSchema = z.object({
  warehouseCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^WH-[A-Z0-9-]+$/,
      "Enter a valid warehouse code (e.g. WH-7K29-XP4)."
    ),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type SignupValues = z.infer<typeof signupSchema>;
export type WarehouseCodeValues = z.infer<typeof warehouseCodeSchema>;
