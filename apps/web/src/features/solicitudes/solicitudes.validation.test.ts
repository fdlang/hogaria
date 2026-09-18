import { describe, expect, it } from "vitest";
import { validateSolicitud } from "./solicitudes.validation";

const validForm = {
  nombre: "Ana García",
  email: "ana@example.com",
  telefono: "+34 614 786 341",
  tipo: "Reforma integral",
  descripcion: "Queremos redistribuir la vivienda y renovar las instalaciones.",
};

describe("validateSolicitud", () => {
  it("accepts a complete form and a Spanish mobile number with separators", () => {
    expect(validateSolicitud(validForm)).toEqual({});
  });

  it("accepts an empty optional phone number", () => {
    expect(validateSolicitud({ ...validForm, telefono: "" })).toEqual({});
  });

  it("reports every required or invalid field", () => {
    expect(validateSolicitud({ ...validForm, nombre: " ", email: "incorrecto", telefono: "600 12", tipo: "", descripcion: "corta" })).toEqual({
      nombre: "Obligatorio",
      email: "Introduce un email válido",
      telefono: "Introduce un teléfono español válido",
      tipo: "Selecciona un proyecto",
      descripcion: "Mínimo 20 caracteres",
    });
  });
});
