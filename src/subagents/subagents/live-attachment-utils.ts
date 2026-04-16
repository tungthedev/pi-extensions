import type { InteractiveLiveChildAttachment, LiveChildAttachment } from "./types.ts";

export function notifyStateChange(attachment: LiveChildAttachment): void {
  const waiters = attachment.stateWaiters.splice(0, attachment.stateWaiters.length);
  for (const waiter of waiters) waiter();
}

export function isInteractiveAttachment(
  attachment: LiveChildAttachment,
): attachment is InteractiveLiveChildAttachment {
  return attachment.transport === "interactive";
}

export function queueAgentOperation<T>(
  attachment: LiveChildAttachment,
  operation: () => Promise<T>,
): Promise<T> {
  const run = attachment.operationQueue.then(operation, operation);
  attachment.operationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function waitForStateChange(attachment: LiveChildAttachment, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => {
        attachment.stateWaiters = attachment.stateWaiters.filter((waiter) => waiter !== onChange);
        resolve();
      },
      Math.max(1, timeoutMs),
    );

    const onChange = () => {
      clearTimeout(timer);
      resolve();
    };

    attachment.stateWaiters.push(onChange);
  });
}

export function waitForAnyStateChange(
  attachments: LiveChildAttachment[],
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (attachments.length === 0) {
      setTimeout(() => resolve(false), Math.max(1, timeoutMs));
      return;
    }

    let settled = false;
    const listeners: Array<{ attachment: LiveChildAttachment; waiter: () => void }> = [];
    const cleanup = () => {
      for (const { attachment, waiter } of listeners) {
        attachment.stateWaiters = attachment.stateWaiters.filter((entry) => entry !== waiter);
      }
    };
    const finish = (changed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(changed);
    };
    const timer = setTimeout(() => finish(false), Math.max(1, timeoutMs));

    for (const attachment of attachments) {
      const waiter = () => finish(true);
      listeners.push({ attachment, waiter });
      attachment.stateWaiters.push(waiter);
    }
  });
}
