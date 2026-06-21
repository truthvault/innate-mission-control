function hasInvoice(order) {
  return Boolean(order.xero || order.xeroInvoiceNumber);
}

function nameMatches(order, pattern) {
  return pattern.test(order.customer.trim());
}

export function invoiceExpectationForOrder(order) {
  if (nameMatches(order, /^blair\s+york$/i)) {
    return {
      state: "ignored",
      label: "Invoice check ignored",
      detail: "Marked as done/ignored for invoice hygiene; no Xero follow-up needed.",
      requiresInvoice: false,
    };
  }

  if (nameMatches(order, /\bfl\s+beech\s+samples\b/i) || nameMatches(order, /^fl\s+samples\b/i)) {
    return {
      state: "internal",
      label: "Internal / no invoice",
      detail: "Internal sample/workshop work; no customer invoice expected.",
      requiresInvoice: false,
    };
  }

  if (order.rawMondayItem === "Sample" && !hasInvoice(order)) {
    return {
      state: "no_charge_sample",
      label: "No-charge sample",
      detail: "Customer sample supplied without a Xero invoice; track the sample spec and follow-up instead.",
      requiresInvoice: false,
    };
  }

  return {
    state: "required",
    label: "Invoice required",
    detail: "Customer order should have a Xero invoice link or invoice number.",
    requiresInvoice: true,
  };
}

export function orderNeedsXeroInvoice(order) {
  return invoiceExpectationForOrder(order).requiresInvoice && !hasInvoice(order);
}
