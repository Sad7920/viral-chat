import { ArrowUp, Square } from "lucide-react";
import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  streaming: boolean;
  canSend: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
};

export function Composer({ streaming, canSend, onSend, onStop }: Props) {
  const [value, setValue] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const empty = value.trim() === "";

  function resize(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }

  function send() {
    const text = value.trim();
    if (!text || streaming || !canSend) return;
    setValue("");
    const element = field.current;
    if (element) element.style.height = "auto";
    onSend(text);
  }

  function onChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setValue(event.target.value);
    resize(event.target);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    // keyCode 229 is an IME composition confirm, not a send.
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    event.preventDefault();
    send();
  }

  return (
    <div className="flex items-end gap-2 rounded-card border bg-card p-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
      <textarea
        ref={field}
        rows={1}
        value={value}
        maxLength={4000}
        disabled={streaming}
        aria-label="Message"
        placeholder="Write a message"
        onChange={onChange}
        onKeyDown={onKeyDown}
        className="max-h-36 w-full resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-subtle disabled:opacity-50"
      />
      <Button
        type="button"
        size="icon"
        aria-label={streaming ? "Stop generating" : "Send"}
        disabled={!streaming && (empty || !canSend)}
        onClick={streaming ? onStop : send}
      >
        {streaming ? <Square className="fill-current" /> : <ArrowUp />}
      </Button>
    </div>
  );
}
