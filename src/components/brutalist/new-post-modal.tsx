"use client";

import { useEffect, useRef } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { trpc } from "@/trpc/hooks";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Form = {
  title: string;
  excerpt: string;
  tag: string;
  readTime: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function NewPostModal({ open, onClose }: Props) {
  const titleRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, isValid },
  } = useForm<Form>({
    defaultValues: { title: "", excerpt: "", tag: "", readTime: "" },
    mode: "onChange",
  });

  const push = trpc.posts.push.useMutation({
    onSuccess: () => {
      reset();
      onClose();
    },
  });

  const onSubmit: SubmitHandler<Form> = async (data) => {
    const date = new Date().toISOString().split("T")[0];
    await push.mutateAsync({ ...data, date });
  };

  const { ref: titleFormRef, ...titleRest } = register("title", {
    required: true,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void handleSubmit(onSubmit)();
      }
    };
    window.addEventListener("keydown", onKey);
    const focus = setTimeout(() => titleRef.current?.focus(), 60);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(focus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="border-0 shadow-none bg-transparent p-0 gap-0 sm:max-w-none w-auto"
      >
        <DialogTitle className="sr-only">New post</DialogTitle>
        <DialogDescription className="sr-only">
          Draft a new entry for the journal.
        </DialogDescription>
        <div className="bru-modal-shell">
          <div className="bru-modal-head">
            <h2 className="bru-modal-h">New post</h2>
            <button
              type="button"
              className="bru-modal-x"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <form className="bru-form" onSubmit={handleSubmit(onSubmit)}>
            <label className="bru-field">
              <span className="bru-field-label">Title</span>
              <input
                type="text"
                className="bru-input"
                placeholder="Something worth reading"
                {...titleRest}
                ref={(el) => {
                  titleFormRef(el);
                  titleRef.current = el;
                }}
              />
            </label>

            <label className="bru-field">
              <span className="bru-field-label">Excerpt</span>
              <textarea
                className="bru-input bru-textarea"
                rows={3}
                placeholder="A short summary — one or two sentences."
                {...register("excerpt", { required: true })}
              />
            </label>

            <div className="bru-form-row">
              <label className="bru-field">
                <span className="bru-field-label">Tag</span>
                <input
                  type="text"
                  className="bru-input"
                  placeholder="TypeScript"
                  {...register("tag", { required: true })}
                />
              </label>
              <label className="bru-field">
                <span className="bru-field-label">Read time</span>
                <input
                  type="text"
                  className="bru-input"
                  placeholder="5 min"
                  {...register("readTime", { required: true })}
                />
              </label>
            </div>

            <div className="bru-modal-actions">
              <button
                type="button"
                className="bru-btn"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bru-btn bru-btn-solid"
                disabled={!isValid || isSubmitting}
              >
                {isSubmitting ? "Publishing…" : "Publish"}
              </button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
