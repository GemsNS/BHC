import type { AppData, KnockProduct, KnockProposal, KnockService, ProposalStatus } from "./types";

export function computeProposalTotal(
  lineItems: Array<{ label: string; amount: number }>,
  taxRate: number,
): number {
  const sub = lineItems.reduce((s, l) => s + l.amount, 0);
  return Math.round(sub * (1 + taxRate) * 100) / 100;
}

export function linesFromCatalog(
  products: KnockProduct[],
  services: KnockService[],
  productIds: string[],
  serviceIds: string[],
  extras: Array<{ label: string; amount: number }> = [],
): Array<{ label: string; amount: number }> {
  return [
    ...products.filter((p) => productIds.includes(p.id)).map((p) => ({ label: p.name, amount: p.unitPrice })),
    ...services.filter((s) => serviceIds.includes(s.id)).map((s) => ({ label: s.name, amount: s.basePrice })),
    ...extras,
  ];
}

export function signProposal(
  proposal: KnockProposal,
  input: {
    signerName: string;
    signerEmail?: string;
    signatureDataUrl: string;
    nowIso: string;
  },
): KnockProposal {
  return {
    ...proposal,
    status: "signed" as ProposalStatus,
    signedAt: input.nowIso,
    signatureDataUrl: input.signatureDataUrl,
    signerName: input.signerName,
    signerEmail: input.signerEmail ?? proposal.signerEmail,
  };
}

export function proposalsForPin(data: AppData, pinId: string): KnockProposal[] {
  return data.knockProposals.filter((p) => p.pinId === pinId);
}
