import { useState, type FormEvent, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  open: boolean;
  returnFocus: RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (summary: string) => Promise<void>;
};

export function EscalateDialog({ open, returnFocus, onOpenChange, onSubmit }: Props) {
  const [summary, setSummary] = useState("");
  const [pending, setPending] = useState(false);
  const trimmed = summary.trim();
  const canSend = trimmed.length >= 1 && trimmed.length <= 500 && !pending;

  function close() {
    if (pending) return;
    setSummary("");
    onOpenChange(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    setPending(true);
    try {
      await onSubmit(trimmed);
      setSummary("");
      onOpenChange(false);
    } catch {
      // The caller toasts. Leave the summary in place.
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>Escalate</DialogTitle>
            <DialogDescription>
              Send this conversation to a person. Add a short summary of what they should know.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="escalate-summary">Summary</Label>
            <Textarea
              id="escalate-summary"
              value={summary}
              maxLength={500}
              required
              disabled={pending}
              onChange={(event) => setSummary(event.target.value)}
            />
            <p className="text-right text-xs text-subtle">{summary.length}/500</p>
          </div>
          <DialogFooter className="flex-row justify-end">
            <Button type="button" variant="secondary" disabled={pending} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSend}>
              Escalate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
