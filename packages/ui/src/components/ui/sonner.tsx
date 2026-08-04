"use client";

import * as React from "react";
import { Toaster as SonnerToaster, toast } from "sonner";

import { cn } from "../../utils";

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

const Toaster = ({ className, ...props }: ToasterProps) => {
  return (
    <SonnerToaster
      className={cn("toaster group", className)}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
