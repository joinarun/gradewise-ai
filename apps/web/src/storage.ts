import { useCallback, useEffect, useRef, useState } from "react";
import { defaultWorkspace } from "./model";
import type { Workspace } from "./model";

let database: Promise<IDBDatabase> | undefined;
const namespace = "gradewise-web-v1";

function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(namespace, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspaces");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

async function readWorkspace(): Promise<Workspace> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("workspaces", "readonly").objectStore("workspaces").get("local");
    request.onsuccess = () => resolve(request.result ?? defaultWorkspace);
    request.onerror = () => reject(request.error);
  });
}

export type ChangeWorkspace = (state: Workspace) => Workspace;

async function writeWorkspace(change: ChangeWorkspace): Promise<Workspace> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("workspaces", "readwrite");
    const store = transaction.objectStore("workspaces");
    const request = store.get("local");
    let saved: Workspace;
    let changeError: unknown;
    request.onsuccess = () => {
      try {
        const current = request.result ?? defaultWorkspace;
        saved = { ...change(current), revision: current.revision + 1 };
        store.put(saved, "local");
      } catch (error) {
        changeError = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(saved);
    transaction.onabort = () => reject(changeError ?? transaction.error ?? new Error("Could not save changes."));
    transaction.onerror = () => reject(transaction.error);
  });
}

export function useWorkspace() {
  const [state, setState] = useState<Workspace>();
  const [storageError, setStorageError] = useState("");
  const channel = useRef<BroadcastChannel | null>(null);
  const publish = useCallback((workspace: Workspace) => {
    setState((previous) => previous && previous.revision > workspace.revision ? previous : workspace);
  }, []);

  useEffect(() => {
    let mounted = true;
    const sync = () => {
      void readWorkspace().then((current) => {
        if (mounted) publish(current);
      }).catch(() => setStorageError("This browser profile could not open the local workspace."));
    };
    sync();
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel(namespace);
      channel.current.onmessage = sync;
    }
    window.addEventListener("focus", sync);
    return () => {
      mounted = false;
      channel.current?.close();
      channel.current = null;
      window.removeEventListener("focus", sync);
    };
  }, [publish]);

  const update = useCallback(async (change: ChangeWorkspace) => {
    const saved = await writeWorkspace(change);
    publish(saved);
    channel.current?.postMessage(saved.revision);
    return saved;
  }, [publish]);

  return { state, update, storageError };
}
