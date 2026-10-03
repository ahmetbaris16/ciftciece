/** Admin işleminde kullanıcıya gösterilecek hata (ör. "Mesaj bulunamadı.", "E-posta ayarlı değil.") */
export class AdminActionError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
    this.name = "AdminActionError";
  }
}
