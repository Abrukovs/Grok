import { Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ASK_CHIPS = ["Разбор дня", "Что по теннису?", "Что по РПЛ?"];

type Props = {
  disabled?: boolean;
  calmOn?: boolean;
  onToggleCalm?: () => void;
  onSend: (text: string) => void;
};

export function Composer({ disabled, calmOn, onToggleCalm, onSend }: Props) {
  const [value, setValue] = useState("");

  function submit(text: string) {
    const next = text.trim();
    if (!next || disabled) return;
    onSend(next);
    setValue("");
  }

  return (
    <div className="border-t border-border bg-bg/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm">
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={onToggleCalm}
          className={cn(
            "h-9 shrink-0 rounded-full px-3 text-xs shadow-[var(--shadow-border)]",
            calmOn ? "bg-accent text-accent-fg" : "bg-surface text-muted",
          )}
        >
          Только спокойные
        </button>
        {ASK_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={disabled}
            onClick={() => submit(chip)}
            className="h-9 shrink-0 rounded-full bg-surface px-3 text-xs text-muted shadow-[var(--shadow-border)] disabled:opacity-40"
          >
            {chip}
          </button>
        ))}
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        <label className="sr-only" htmlFor="liner-ask">
          Вопрос аналитику
        </label>
        <textarea
          id="liner-ask"
          rows={1}
          value={value}
          disabled={disabled}
          placeholder="Спросите про матч или рынок"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(value);
            }
          }}
          className="max-h-28 min-h-11 flex-1 resize-none rounded-lg bg-surface px-3 py-2.5 text-sm text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus:shadow-[var(--shadow-border-hover)] disabled:opacity-40"
        />
        <Button
          type="submit"
          size="icon"
          disabled={disabled || !value.trim()}
          aria-label="Отправить"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}