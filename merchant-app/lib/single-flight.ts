// Share polling/focus/reconnect requests. A mutation can supersede an old snapshot.
export class SingleFlight<T> {
  private current: { controller: AbortController; promise: Promise<T> } | null = null;
  run(task: (signal: AbortSignal) => Promise<T>, force = false): Promise<T> {
    if (this.current && !force) return this.current.promise;
    this.cancel();
    const controller = new AbortController();
    const promise = Promise.resolve().then(() => task(controller.signal)).finally(() => {
      if (this.current?.controller === controller) this.current = null;
    });
    this.current = { controller, promise };
    return promise;
  }
  cancel() {
    this.current?.controller.abort();
    this.current = null;
  }
}
