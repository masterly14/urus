import type {
  SignaturitConfig,
  CreateSignatureParams,
  SignaturitSignatureResponse,
} from "./types";

const DEFAULT_SANDBOX_URL = "https://api.sandbox.signaturit.com/v3";

function resolveConfig(overrides?: Partial<SignaturitConfig>): SignaturitConfig {
  return {
    apiUrl:
      overrides?.apiUrl ??
      process.env.SIGNATURIT_API_URL ??
      DEFAULT_SANDBOX_URL,
    accessToken:
      overrides?.accessToken ?? process.env.SIGNATURIT_ACCESS_TOKEN ?? "",
  };
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export interface SignaturitClient {
  createSignatureRequest(
    params: CreateSignatureParams,
  ): Promise<SignaturitSignatureResponse>;
  getSignature(signatureId: string): Promise<SignaturitSignatureResponse>;
  downloadSignedDocument(
    signatureId: string,
    documentId: string,
  ): Promise<Buffer>;
  downloadAuditTrail(
    signatureId: string,
    documentId: string,
  ): Promise<Buffer>;
  cancelSignature(signatureId: string): Promise<void>;
}

export function createSignaturitClient(
  overrides?: Partial<SignaturitConfig>,
): SignaturitClient {
  const config = resolveConfig(overrides);

  if (!config.accessToken) {
    throw new Error(
      "SIGNATURIT_ACCESS_TOKEN is required. Set the env var or pass accessToken.",
    );
  }

  const base = config.apiUrl.replace(/\/+$/, "");

  async function createSignatureRequest(
    params: CreateSignatureParams,
  ): Promise<SignaturitSignatureResponse> {
    const form = new FormData();

    const blob = new Blob([params.file], { type: "application/pdf" });
    form.append("files[0]", blob, params.fileName);

    for (let i = 0; i < params.recipients.length; i++) {
      const r = params.recipients[i];
      form.append(`recipients[${i}][name]`, r.name);
      form.append(`recipients[${i}][email]`, r.email);
      if (r.phone) form.append(`recipients[${i}][phone]`, r.phone);
    }

    if (params.eventsUrl) {
      form.append("events_url", params.eventsUrl);
    }
    if (params.deliveryType) {
      form.append("delivery_type", params.deliveryType);
    }
    if (params.expireTime != null) {
      form.append("expire_time", String(params.expireTime));
    }
    if (params.name) {
      form.append("name", params.name);
    }
    if (params.signingMode) {
      form.append("signing_mode", params.signingMode);
    }
    if (params.data) {
      for (const [key, value] of Object.entries(params.data)) {
        form.append(`data[${key}]`, value);
      }
    }

    const res = await fetch(`${base}/signatures.json`, {
      method: "POST",
      headers: authHeaders(config.accessToken),
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Signaturit createSignatureRequest failed (${res.status}): ${text}`,
      );
    }

    return (await res.json()) as SignaturitSignatureResponse;
  }

  async function getSignature(
    signatureId: string,
  ): Promise<SignaturitSignatureResponse> {
    const res = await fetch(`${base}/signatures/${signatureId}.json`, {
      method: "GET",
      headers: authHeaders(config.accessToken),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Signaturit getSignature failed (${res.status}): ${text}`,
      );
    }

    return (await res.json()) as SignaturitSignatureResponse;
  }

  async function downloadSignedDocument(
    signatureId: string,
    documentId: string,
  ): Promise<Buffer> {
    const res = await fetch(
      `${base}/signatures/${signatureId}/documents/${documentId}/download/signed`,
      { method: "GET", headers: authHeaders(config.accessToken) },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Signaturit downloadSignedDocument failed (${res.status}): ${text}`,
      );
    }

    return Buffer.from(await res.arrayBuffer());
  }

  async function downloadAuditTrail(
    signatureId: string,
    documentId: string,
  ): Promise<Buffer> {
    const res = await fetch(
      `${base}/signatures/${signatureId}/documents/${documentId}/download/audit_trail`,
      { method: "GET", headers: authHeaders(config.accessToken) },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Signaturit downloadAuditTrail failed (${res.status}): ${text}`,
      );
    }

    return Buffer.from(await res.arrayBuffer());
  }

  async function cancelSignature(signatureId: string): Promise<void> {
    const res = await fetch(`${base}/signatures/${signatureId}/cancel.json`, {
      method: "PATCH",
      headers: authHeaders(config.accessToken),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Signaturit cancelSignature failed (${res.status}): ${text}`,
      );
    }
  }

  return {
    createSignatureRequest,
    getSignature,
    downloadSignedDocument,
    downloadAuditTrail,
    cancelSignature,
  };
}
