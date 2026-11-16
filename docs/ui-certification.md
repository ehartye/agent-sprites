# Immutable UI data certification

Immutable UI data admission uses a module-private, object-local ECMAScript private-field identity certificate. Snapshot admission still validates and copies raw data before freezing and certifying its own copies. Internal ownership-transfer publication still validates the complete ordinary non-Proxy graph, freezes it, revalidates it, and only then certifies it. Publication does not make arbitrary Proxy inputs safe.

Certificates preserve per-node identity sharing and do not appear in own keys, symbols, descriptors, or prototypes. They cannot be inherited, spread, structured-cloned, or forwarded through a Proxy. Freezing alone grants no certificate. Another module instance must admit the value independently. Existing certified objects remain certified without a rotating or evicting store.

## Instrumentation migration

Immutable certification no longer constructs or invokes a WeakSet. Monkey-patched WeakSet constructors, has, and add therefore no longer observe those calls, receivers or arguments, nor can they throw, reenter, or spoof membership at that boundary. This is an intentional internal representation change, not universal observational equivalence under intrinsic interception. Generic recursive-freeze memoization and semantic node certification retain their separate WeakSets and existing behavior. Raw descriptor, Proxy, validation, and freeze-hook behavior is not intentionally changed.

The representation removes this module's explicit shared immutable-certification WeakSet. It does not prescribe the JavaScript engine's internal private-field storage or prove absence of engine allocation or garbage-collection costs.
