import { useEffect, useRef, useState } from "react";

const QUICK_ACTIONS = [
  { id: "read-aloud", label: "Read aloud", shortcut: "Ctrl+Alt+R" },
  { id: "simplify", label: "Simplify text", shortcut: "Ctrl+Alt+S" },
  { id: "translate-telugu", label: "Translate to Telugu", shortcut: "Ctrl+Alt+T" },
  { id: "summarize", label: "Summarize", shortcut: "Ctrl+Alt+U" },
  { id: "mind-map", label: "Generate mind map", shortcut: "Ctrl+Alt+M" },
];

const SHORTCUTS_STORAGE_KEY = "uniread.quick-actions.shortcuts";
const SEQUENCES_STORAGE_KEY = "uniread.quick-actions.sequences";
const DEFAULT_SHORTCUTS = Object.fromEntries(
  QUICK_ACTIONS.map(({ id, shortcut }) => [id, shortcut]),
);

function readStoredValue(key, fallback, validate) {
  const stored = window.localStorage.getItem(key);
  if (!stored) return fallback;
  const parsed = JSON.parse(stored);
  if (!validate(parsed)) throw new Error(`Saved quick action settings in ${key} are invalid.`);
  return parsed;
}

function shortcutFromEvent(event) {
  if (["Alt", "Control", "Meta", "Shift"].includes(event.key)) return "";
  const modifiers = [];
  if (event.ctrlKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Meta");
  if (!modifiers.some((modifier) => ["Ctrl", "Alt", "Meta"].includes(modifier))) return "";
  const key = event.key === " " ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [...modifiers, key].join("+");
}

function isEditableTarget(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function isValidShortcuts(value) {
  return value && typeof value === "object" && QUICK_ACTIONS.every(
    ({ id }) => typeof value[id] === "string",
  );
}

function isValidSequences(value) {
  return Array.isArray(value) && value.every(
    (sequence) => sequence
      && typeof sequence.id === "string"
      && typeof sequence.name === "string"
      && Array.isArray(sequence.actions)
      && sequence.actions.length > 0
      && sequence.actions.every((action) => QUICK_ACTIONS.some(({ id }) => id === action))
      && typeof sequence.shortcut === "string",
  );
}

function formatShortcut(shortcut) {
  return shortcut || "Not set";
}

export default function SmartQuickActions({ busy, isSpeaking, onRunAction, onFeedback, onStorageError }) {
  const [shortcuts, setShortcuts] = useState(DEFAULT_SHORTCUTS);
  const [sequences, setSequences] = useState([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState(null);
  const [sequenceName, setSequenceName] = useState("");
  const [selectedActions, setSelectedActions] = useState([]);
  const [runningAction, setRunningAction] = useState("");
  const onStorageErrorRef = useRef(onStorageError);
  onStorageErrorRef.current = onStorageError;

  useEffect(() => {
    try {
      setShortcuts(readStoredValue(SHORTCUTS_STORAGE_KEY, DEFAULT_SHORTCUTS, isValidShortcuts));
      setSequences(readStoredValue(SEQUENCES_STORAGE_KEY, [], isValidSequences));
    } catch (error) {
      onStorageErrorRef.current(error instanceof Error ? error.message : "Could not load saved quick actions.");
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(shortcuts));
      window.localStorage.setItem(SEQUENCES_STORAGE_KEY, JSON.stringify(sequences));
    } catch (error) {
      onStorageErrorRef.current(error instanceof Error ? error.message : "Could not save quick action settings.");
    }
  }, [settingsLoaded, shortcuts, sequences]);

  useEffect(() => {
    function handleShortcut(event) {
      if (editingShortcut) {
        if (event.key === "Escape") {
          event.preventDefault();
          setEditingShortcut(null);
          return;
        }
        const shortcut = shortcutFromEvent(event);
        if (!shortcut) return;
        event.preventDefault();
        const isDuplicate = [
          ...QUICK_ACTIONS
            .filter(({ id }) => editingShortcut.type !== "action" || id !== editingShortcut.id)
            .map(({ id }) => shortcuts[id]),
          ...sequences
            .filter(({ id }) => editingShortcut.type !== "sequence" || id !== editingShortcut.id)
            .map(({ shortcut: sequenceShortcut }) => sequenceShortcut),
        ].some((savedShortcut) => savedShortcut.toLowerCase() === shortcut.toLowerCase());
        if (isDuplicate) {
          setEditingShortcut(null);
          onFeedback("error", `${shortcut} is already assigned. Choose a different shortcut.`);
          return;
        }
        if (editingShortcut.type === "action") {
          setShortcuts((current) => ({ ...current, [editingShortcut.id]: shortcut }));
        } else {
          setSequences((current) => current.map((sequence) => (
            sequence.id === editingShortcut.id ? { ...sequence, shortcut } : sequence
          )));
        }
        setEditingShortcut(null);
        onFeedback("success", `Shortcut saved: ${shortcut}.`);
        return;
      }
      if (busy || runningAction || isEditableTarget(event.target)) return;
      const action = QUICK_ACTIONS.find(({ id }) => shortcuts[id] && shortcuts[id].toLowerCase() === shortcutFromEvent(event).toLowerCase());
      const sequence = sequences.find(({ shortcut }) => shortcut && shortcut.toLowerCase() === shortcutFromEvent(event).toLowerCase());
      if (!action && !sequence) return;
      event.preventDefault();
      if (sequence) void runSequence(sequence);
      else if (action) void runSingleAction(action.id);
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [busy, editingShortcut, onFeedback, onRunAction, runningAction, sequences, shortcuts]);

  async function runSingleAction(actionId) {
    setRunningAction(actionId);
    try {
      await onRunAction(actionId);
    } catch (error) {
      onFeedback("error", error instanceof Error ? error.message : "The quick action could not be completed.");
    } finally {
      setRunningAction("");
    }
  }

  async function runSequence(sequence) {
    setRunningAction(sequence.id);
    try {
      for (const actionId of sequence.actions) {
        const completed = await onRunAction(actionId);
        if (completed === false) return;
      }
      onFeedback("success", `Action sequence “${sequence.name}” is complete.`);
    } catch (error) {
      onFeedback("error", error instanceof Error ? error.message : `Action sequence “${sequence.name}” failed.`);
    } finally {
      setRunningAction("");
    }
  }

  function saveSequence(event) {
    event.preventDefault();
    const name = sequenceName.trim();
    if (!name || selectedActions.length === 0) return;
    const id = globalThis.crypto?.randomUUID?.() ?? `sequence-${Date.now()}`;
    setSequences((current) => [...current, { id, name, actions: selectedActions, shortcut: "" }]);
    setSequenceName("");
    setSelectedActions([]);
    onFeedback("success", `Saved action sequence “${name}”.`);
  }

  return (
    <section className="smart-actions" aria-labelledby="smart-actions-heading">
      <div className="smart-actions-heading">
        <div>
          <h3 id="smart-actions-heading">Smart quick actions</h3>
          <p>Run common reading tasks instantly, or use a saved shortcut.</p>
        </div>
        {runningAction && <span className="smart-actions-running" role="status">Working…</span>}
      </div>
      <div className="smart-action-buttons" role="group" aria-label="Quick actions">
        {QUICK_ACTIONS.map(({ id, label }) => (
          <button
            className="smart-action-button"
            key={id}
            type="button"
            disabled={busy || Boolean(runningAction)}
            aria-pressed={id === "read-aloud" ? isSpeaking : undefined}
            aria-keyshortcuts={shortcuts[id].replaceAll("+", " ")}
            onClick={() => void runSingleAction(id)}
          >
            {id === "read-aloud" && isSpeaking ? "Stop reading aloud" : label}
          </button>
        ))}
      </div>
      <details className="smart-actions-settings">
        <summary>Customize shortcuts and action sequences</summary>
        <div className="smart-actions-settings-body">
          <h4>Keyboard shortcuts</h4>
          <p>Choose a shortcut, then press a combination with Ctrl, Alt, or Command. Shortcuts are paused while you type in a field.</p>
          <ul className="shortcut-list">
            {QUICK_ACTIONS.map(({ id, label }) => (
              <li key={id}>
                <span>{label}</span>
                <span className="shortcut-value">{formatShortcut(shortcuts[id])}</span>
                <button
                  type="button"
                  onClick={() => setEditingShortcut({ type: "action", id })}
                  aria-label={`Change shortcut for ${label}`}
                >
                  {editingShortcut?.type === "action" && editingShortcut.id === id ? "Press keys…" : "Change"}
                </button>
              </li>
            ))}
          </ul>
          {editingShortcut && <p className="shortcut-capture" role="status">Press your new shortcut, or Escape to cancel.</p>}

          <h4>Saved action sequences</h4>
          {sequences.length > 0 && (
            <ul className="saved-sequences">
              {sequences.map((sequence) => (
                <li key={sequence.id}>
                  <span><strong>{sequence.name}</strong><small>{sequence.actions.map((id) => QUICK_ACTIONS.find((action) => action.id === id)?.label).join(" → ")}</small></span>
                  <button type="button" disabled={busy || Boolean(runningAction)} onClick={() => void runSequence(sequence)}>Run</button>
                  <button
                    type="button"
                    aria-label={`Change shortcut for ${sequence.name}`}
                    onClick={() => setEditingShortcut({ type: "sequence", id: sequence.id })}
                  >
                    {editingShortcut?.type === "sequence" && editingShortcut.id === sequence.id ? "Press keys…" : formatShortcut(sequence.shortcut)}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${sequence.name}`}
                    onClick={() => setSequences((current) => current.filter((saved) => saved.id !== sequence.id))}
                  >Delete</button>
                </li>
              ))}
            </ul>
          )}
          <form className="sequence-form" onSubmit={saveSequence}>
            <label htmlFor="sequence-name">Sequence name</label>
            <input
              id="sequence-name"
              value={sequenceName}
              onChange={(event) => setSequenceName(event.target.value)}
              maxLength={60}
              placeholder="e.g. Study prep"
            />
            <fieldset>
              <legend>Choose actions (they run in the order selected)</legend>
              {QUICK_ACTIONS.map(({ id, label }) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={selectedActions.includes(id)}
                    onChange={(event) => setSelectedActions((current) => (
                      event.target.checked
                        ? [...current, id]
                        : current.filter((actionId) => actionId !== id)
                    ))}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            {selectedActions.length > 0 && (
              <p className="sequence-order">
                Sequence: {selectedActions.map((id, index) => `${index + 1}. ${QUICK_ACTIONS.find((action) => action.id === id)?.label}`).join(" → ")}
              </p>
            )}
            <button type="submit" disabled={!sequenceName.trim() || selectedActions.length === 0}>Save sequence</button>
          </form>
        </div>
      </details>
    </section>
  );
}
