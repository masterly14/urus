CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "property_visit_slots"
  ADD CONSTRAINT "property_visit_slots_no_active_overlap"
  EXCLUDE USING gist (
    "propertyCode" WITH =,
    tsrange("slotStart", "slotEnd", '[)') WITH &&
  )
  WHERE ("cancelled" = false);
