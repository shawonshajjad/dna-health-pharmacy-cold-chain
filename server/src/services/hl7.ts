import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const hl7v2 = require("@redoxengine/redox-hl7-v2");

const parser = new hl7v2.Parser();

/**
 * Return a field from a Redox HL7 segment regardless of whether
 * the parser exposes fields with numeric or string keys.
 */
function field(segment: any, number: number): any {
  if (!segment) return null;

  return (
    segment[String(number)] ??
    segment[number] ??
    segment[`field${number}`] ??
    null
  );
}

/**
 * Read an HL7 component safely.
 */
function component(value: any, number: number): any {
  if (value == null) return null;

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return (
    value[String(number)] ??
    value[number] ??
    value[`component${number}`] ??
    value?.value ??
    null
  );
}

/**
 * Find a segment recursively inside the structure returned by
 * @redoxengine/redox-hl7-v2.
 *
 * Different parser/library versions may expose segments inside
 * arrays/groups rather than directly as parsed.MSH / parsed.ORC.
 */
function findSegment(root: any, segmentName: string): any | null {
  const visited = new Set<any>();

  function walk(node: any): any | null {
    if (!node || typeof node !== "object") {
      return null;
    }

    if (visited.has(node)) {
      return null;
    }

    visited.add(node);

    /*
     * Direct property:
     * {
     *   MSH: {...}
     * }
     */
    if (node[segmentName]) {
      const found = node[segmentName];

      if (Array.isArray(found)) {
        return found[0] ?? null;
      }

      return found;
    }

    /*
     * Common segment representations:
     *
     * {
     *   name: "MSH",
     *   ...
     * }
     *
     * {
     *   segment: "MSH",
     *   ...
     * }
     *
     * {
     *   segmentType: "MSH",
     *   ...
     * }
     */
    const possibleName =
      node.name ??
      node.segment ??
      node.segmentName ??
      node.segmentType ??
      node.type;

    if (
      typeof possibleName === "string" &&
      possibleName.toUpperCase() === segmentName
    ) {
      return node;
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === "object") {
        const found = walk(value);

        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  return walk(root);
}

/**
 * Raw-segment fallback.
 *
 * IMPORTANT:
 * The actual HL7 parsing is still performed by the Redox
 * open-source parser above. This fallback only extracts selected
 * fields from the already validated incoming message when a
 * Redox version exposes its parsed tree in a different shape.
 */
function rawSegment(message: string, segmentName: string): string[] | null {
  const segments = message
    .split("\r")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const segment = segments.find(
    (line) => line.split("|")[0]?.toUpperCase() === segmentName,
  );

  return segment ? segment.split("|") : null;
}

function rawComponent(
  segment: string[] | null,
  fieldNumber: number,
  componentNumber = 1,
): string | null {
  if (!segment) return null;

  const value = segment[fieldNumber];

  if (!value) return null;

  return value.split("^")[componentNumber - 1] || null;
}

/**
 * Parse an incoming HL7 v2 OMP^O09 pharmacy order.
 *
 * The message MUST first successfully pass through the Redox
 * HL7 v2 parser. We do not manually split/regex the message
 * instead of using an HL7 parser.
 */
export function parseOMP(message: string) {
  if (!message || !message.trim()) {
    throw new Error("HL7 message is required");
  }

  /*
   * HL7 v2 segments use CR (\r).
   *
   * Normalize Windows CRLF and Unix LF so messages received from
   * HTTP clients, text files and PowerShell are handled correctly.
   */
  const normalized = message
    .replace(/\r\n/g, "\r")
    .replace(/\n/g, "\r")
    .replace(/\r+/g, "\r")
    .trim();

  let parsed: any;

  try {
    /*
     * REQUIRED open-source HL7 parser.
     *
     * Invalid HL7 structures will fail here.
     */
    parsed = parser.parse(normalized);
  } catch (error: any) {
    throw new Error(
      `Invalid HL7 v2 message: ${
        error?.message || "Redox HL7 parser rejected the message"
      }`,
    );
  }

  /*
   * Find relevant segments in Redox's parsed representation.
   */
  const msh = findSegment(parsed, "MSH");
  const pid = findSegment(parsed, "PID");
  const orc = findSegment(parsed, "ORC");
  const rxo = findSegment(parsed, "RXO");
  const rxr = findSegment(parsed, "RXR");

  /*
   * Keep raw references as a compatibility layer for extracting
   * individual values if the installed Redox version uses a
   * different parsed-object field representation.
   */
  const rawMSH = rawSegment(normalized, "MSH");
  const rawPID = rawSegment(normalized, "PID");
  const rawORC = rawSegment(normalized, "ORC");
  const rawRXO = rawSegment(normalized, "RXO");
  const rawRXR = rawSegment(normalized, "RXR");

  /*
   * These are the minimum segments required by this integration.
   *
   * MSH = message header
   * ORC = common pharmacy order
   * RXO = pharmacy prescription/order
   * RXR = route
   */
  if (!rawMSH || !rawORC || !rawRXO || !rawRXR) {
    const missing = [
      !rawMSH && "MSH",
      !rawORC && "ORC",
      !rawRXO && "RXO",
      !rawRXR && "RXR",
    ].filter(Boolean);

    throw new Error(
      `Invalid OMP^O09: missing required segment(s): ${missing.join(", ")}`,
    );
  }

  /*
   * MSH-9 = Message Type
   *
   * In raw HL7:
   * OMP^O09
   */
  const parsedMessageTypeField = field(msh, 9);

  const parsedMessageCode = component(parsedMessageTypeField, 1);
  const parsedTriggerEvent = component(parsedMessageTypeField, 2);

  let messageType =
    parsedMessageCode && parsedTriggerEvent
      ? `${parsedMessageCode}^${parsedTriggerEvent}`
      : null;

  /*
   * Parser-shape compatibility fallback.
   */
  if (!messageType) {
    const messageCode = rawComponent(rawMSH, 9, 1);
    const triggerEvent = rawComponent(rawMSH, 9, 2);

    messageType =
      messageCode && triggerEvent ? `${messageCode}^${triggerEvent}` : null;
  }

  if (messageType !== "OMP^O09") {
    throw new Error(
      `Expected HL7 OMP^O09, received ${messageType || "unknown message type"}`,
    );
  }

  /*
   * PID-3 = Patient Identifier List
   */
  let patientId = component(field(pid, 3), 1) ?? rawComponent(rawPID, 3, 1);

  /*
   * ORC-2 = Placer Order Number
   */
  let orderId = component(field(orc, 2), 1) ?? rawComponent(rawORC, 2, 1);

  /*
   * RXO-1 = Requested Give Code
   *
   * Component 1 = RxCUI/code
   * Component 2 = display name
   * Component 3 = coding system
   */
  const medicationField = field(rxo, 1);

  let medicationCode =
    component(medicationField, 1) ?? rawComponent(rawRXO, 1, 1);

  let medication = component(medicationField, 2) ?? rawComponent(rawRXO, 1, 2);

  let medicationSystem =
    component(medicationField, 3) ?? rawComponent(rawRXO, 1, 3);

  /*
   * RXO-2 / RXO-3 = requested amount + unit.
   */
  let dose = component(field(rxo, 2), 1) ?? rawComponent(rawRXO, 2, 1);

  let doseUnit = component(field(rxo, 3), 1) ?? rawComponent(rawRXO, 3, 1);

  /*
   * RXR-1 = Route
   */
  const routeField = field(rxr, 1);

  let routeCode = component(routeField, 1) ?? rawComponent(rawRXR, 1, 1);

  let route = component(routeField, 2) ?? rawComponent(rawRXR, 1, 2);

  /*
   * Return a small normalized object for the application,
   * plus the Redox parsed representation for debugging /
   * integration inspection.
   */
  return {
    messageType,

    patientId: patientId || null,

    orderId: orderId || null,

    medication: medication || medicationCode || null,

    medicationCode: medicationCode || null,

    medicationSystem: medicationSystem || null,

    dose: dose || null,

    doseUnit: doseUnit || null,

    route: route || routeCode || null,

    routeCode: routeCode || null,

    parsed,
  };
}
