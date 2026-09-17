import { useCallback, useEffect, useRef, useState } from "react";

export interface VoiceActions {
  toggle(): void;
  next(): void;
  previous(): void;
  shuffle(): void;
  like(): void;
  minimize(): void;
  expand(): void;
}

// Minimal typings for the Web Speech API (Chrome/Edge only).
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

function recognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return (ctor as new () => SpeechRecognitionInstance) ?? null;
}

export function isVoiceSupported(): boolean {
  return recognitionCtor() !== null;
}

function handleCommand(text: string, a: VoiceActions): void {
  if (/\b(next|skip|forward|aage|porer)\b/.test(text)) a.next();
  else if (/\b(previous|back|last|pechhe|ager)\b/.test(text)) a.previous();
  else if (/\b(shuffle|mix|random)\b/.test(text)) a.shuffle();
  else if (/\b(like|love|heart|favourite|favorite)\b/.test(text)) a.like();
  else if (/\b(minimi|hide|small|chhoto)\b/.test(text)) a.minimize();
  else if (/\b(expand|maximi|open|show|fullscreen|boro)\b/.test(text)) a.expand();
  else if (/\b(play|pause|stop|start|resume|chalao|bajao|ruk|tham|band)\b/.test(text))
    a.toggle();
}

export function useVoiceControl(actions: VoiceActions) {
  const [listening, setListening] = useState(false);
  const [supported] = useState(() => isVoiceSupported());
  const [transcript, setTranscript] = useState("");
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const toggle = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* already stopped */
      }
      recRef.current = null;
      setListening(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event: SpeechRecognitionEventLike) => {
      const keys = Object.keys(event.results);
      const last = event.results[Number(keys[keys.length - 1])];
      const text = last?.[0]?.transcript?.trim().toLowerCase() ?? "";
      if (!text) return;
      setTranscript(text);
      handleCommand(text, actionsRef.current);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    rec.onerror = () => {
      recRef.current = null;
      setListening(false);
    };
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      recRef.current = null;
      setListening(false);
    }
  }, []);

  useEffect(
    () => () => {
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
    },
    []
  );

  return { listening, supported, transcript, toggle };
}
