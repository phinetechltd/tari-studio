"use client";

import { JsonForm, type FormField } from "@/components/json-form";

export function AcceptForm(props: { token: string; hasAccount: boolean }) {
  const fields: FormField[] = props.hasAccount
    ? [
        {
          name: "password",
          label: "Your existing password",
          type: "password",
          required: true,
          autoComplete: "current-password",
          help: "You already have an account. Confirm it's you to add this organisation.",
        },
      ]
    : [
        { name: "name", label: "Your name", required: true, autoComplete: "name" },
        {
          name: "password",
          label: "Choose a password",
          type: "password",
          required: true,
          autoComplete: "new-password",
          help: "At least 10 characters.",
        },
      ];

  return (
    <JsonForm
      endpoint="/api/auth/accept-invite"
      fields={fields}
      submitLabel="Accept and continue"
      toBody={(v) => ({ token: props.token, ...v })}
      then={{ redirect: "/app" }}
    />
  );
}
