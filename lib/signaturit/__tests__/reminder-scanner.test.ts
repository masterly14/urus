import { describe, it, expect } from "vitest";
import { getNextReminderAction } from "../reminder-scanner";

describe("getNextReminderAction", () => {
  it("returns none when less than 1 day has passed", () => {
    expect(getNextReminderAction(0.5, 0, 5)).toEqual({ kind: "none" });
  });

  it("returns reminder day 1 when >= 1 day and no reminder sent yet", () => {
    expect(getNextReminderAction(1.0, 0, 5)).toEqual({
      kind: "reminder",
      day: 1,
    });
  });

  it("returns reminder day 1 for 2 days elapsed when no reminder sent", () => {
    expect(getNextReminderAction(2.0, 0, 5)).toEqual({
      kind: "reminder",
      day: 1,
    });
  });

  it("returns none after day 1 reminder but before day 3", () => {
    expect(getNextReminderAction(2.0, 1, 5)).toEqual({ kind: "none" });
  });

  it("returns reminder day 3 when >= 3 days and last was day 1", () => {
    expect(getNextReminderAction(3.0, 1, 5)).toEqual({
      kind: "reminder",
      day: 3,
    });
  });

  it("returns none after day 3 reminder but before day 5", () => {
    expect(getNextReminderAction(4.0, 3, 5)).toEqual({ kind: "none" });
  });

  it("returns reminder day 5 when >= 5 days and last was day 3", () => {
    expect(getNextReminderAction(5.0, 3, 5)).toEqual({
      kind: "reminder",
      day: 5,
    });
  });

  it("returns escalation when >= SLA days and last reminder was day 5", () => {
    expect(getNextReminderAction(5.5, 5, 5)).toEqual({ kind: "escalation" });
  });

  it("returns escalation when SLA exceeded even without all reminders", () => {
    expect(getNextReminderAction(6.0, 0, 5)).toEqual({
      kind: "reminder",
      day: 1,
    });
  });

  it("returns escalation for 7 days with all reminders sent", () => {
    expect(getNextReminderAction(7.0, 5, 5)).toEqual({ kind: "escalation" });
  });

  it("respects custom SLA deadline (e.g. 10 days)", () => {
    expect(getNextReminderAction(6.0, 5, 10)).toEqual({ kind: "none" });
    expect(getNextReminderAction(10.0, 5, 10)).toEqual({ kind: "escalation" });
  });

  it("handles fractional days correctly", () => {
    expect(getNextReminderAction(0.99, 0, 5)).toEqual({ kind: "none" });
    expect(getNextReminderAction(1.01, 0, 5)).toEqual({
      kind: "reminder",
      day: 1,
    });
  });
});
