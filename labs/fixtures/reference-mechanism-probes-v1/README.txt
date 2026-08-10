Deterministic marker fixture for the v0.2 reference-mechanism experiment pack.

Each lesson probe creates any mechanism-specific workspace in a separate temporary
directory. The runner copies this marker fixture for every repetition and verifies
that no probe mutates the declared canonical or per-run fixture.
