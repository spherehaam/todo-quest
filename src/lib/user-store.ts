export type UserUpdate = { level: number; exp: number };
type Subscriber = (u: UserUpdate) => void;
const subscribers = new Set<Subscriber>();

export function publishUserUpdate(update: UserUpdate) {
    console.log('publishUserUpdate', update);
    subscribers.forEach(fn => fn(update));
}

export function subscribeUserUpdate(fn: Subscriber) {
    console.log('subscribeUserUpdate', fn);
    subscribers.add(fn);
    console.log('subscribers', subscribers);
    return () => subscribers.delete(fn);
}
