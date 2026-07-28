# Demo samples (for screenshots)

Synthetic **J1939-style** log + DBC with **varying** RPM / speed / pedal — ready for Graph / Trace / DBC screenshots.

| File | Use |
|------|-----|
| [`j1939-demo.asc`](./j1939-demo.asc) | **Recommended** — Vector ASC, channel 1 only (~30 s) |
| [`j1939-demo.blf`](./j1939-demo.blf) | Same traffic as BLF |
| [`j1939-demo.dbc`](./j1939-demo.dbc) | Matching DBC (`EEC1` / `EEC2` / `CCVS1`) |

> These files are **generated for demos** (not a real vehicle recording). Signal values change over time so charts are clearly visible.

## Load steps

1. **File → Load CAN log…** → `j1939-demo.asc` *(or `.blf`)*
2. **File → Load DBC…** → `j1939-demo.dbc`
3. **File → Channel mapping…** → assign the DBC to **channel 1**  
   *(or use “apply all DBCs to all channels”)*
4. **File → Parse signals**
5. Open **View → Graph** — signals should appear (first signal is auto-added; click **+** for more)  
   **View → Trace** — frame table  
   **View → DBC** — message / bit layout (works after DBC load even without parse)

### Expected after parse

| Signal | Approx. range in this demo |
|--------|----------------------------|
| `EngineSpeed` | 800 → ~2500 rpm |
| `WheelBasedVehicleSpeed` | 0 → ~80 km/h |
| `AcceleratorPedalPosition1` | 0 → ~70 % |
| `EnginePercentLoadAtCurrentSpeed` | ~5 → 70 % |

## Why not the earlier CSS MF4?

The public CSS Electronics J1939 MF4 sample is a real log, but in that capture **engine speed and vehicle speed stay at 0**, and it has an extra channel that made mapping easy to get wrong. It looked like “no data” in Graph. This synthetic pair avoids that.
