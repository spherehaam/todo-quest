export type UserUpdate = { level: number; exp: number };
type Subscriber = (u: UserUpdate) => void;
const subscribers = new Set<Subscriber>();

export function publishUserUpdate(update: UserUpdate) {
    subscribers.forEach(fn => fn(update));
}

export function subscribeUserUpdate(fn: Subscriber) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
}
