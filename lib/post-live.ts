// Avisos depois da live: resumo quando a live termina e mudança de status do pedido (e-mails no M5).
export async function afterLiveEnded(liveId: string) {
  void liveId;
}

export async function notifyOrderStatus(orderIds: string[], status: string) {
  void orderIds;
  void status;
}
