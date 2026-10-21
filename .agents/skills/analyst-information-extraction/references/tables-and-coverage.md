# Dense tables and coverage

Read only when grouped headers, incomplete ranges or comparison structure require it.

Carry group/header labels into values: "Small business / Annual / Up to 10 seats / USD 240" is more useful than an isolated "240". Preserve unit, currency, interval, denominator and qualifying footnote together. A blank, unavailable and zero cell are different states.

For a comparison matrix, keep shared attribute names and aligned values in one reusable table fact if this preserves meaning. For a procedure, retain ordering, prerequisites and exceptions. Dates with different time zones or reporting periods must not be merged.

A coverage boundary is a reading constraint, not permission to guess. Use the existing reader for the next relevant range and reuse its result. If limited context prevents reading a key region, report that concrete limit. Do not assert full coverage from a title or first rows alone.

Example source: "Pilot: 24 sites; median 18% less processing time during May 2025; excludes setup; non-randomized." Retain those qualifiers in the same fact. Do not report "18% faster everywhere", invent a control group, or split exclusions away from the metric they qualify.
