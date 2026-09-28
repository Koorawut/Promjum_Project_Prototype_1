// Typed socket for this app's gateway.
//
// socket.io's Socket class is generic with `SocketData = any` as the
// default type parameter — there is no augmentable `SocketData` interface
// to merge into (a `declare module 'socket.io' { interface SocketData }`
// block compiles but has no effect). The gateway used the raw `Socket`
// alias, so every `socket.data.userId` read was `any` and tripped
// @typescript-eslint/no-unsafe-* across the whole file.
//
// Fix: pin the type parameter once here and export the result.
export interface AuthSocketData {
  userId: string;
  username: string;
  // JWT iat in seconds — used to re-deliver force-kicks to zombie
  // sockets whose token predates the kick.
  iatSec: number;
}

// Socket with our data payload pinned. The other three type parameters
// keep socket.io's permissive DefaultEventsMap default, matching how the
// gateway used the plain `Socket` alias before.
export type TypedSocket = import('socket.io').Socket<
  import('socket.io').DefaultEventsMap,
  import('socket.io').DefaultEventsMap,
  import('socket.io').DefaultEventsMap,
  AuthSocketData
>;
