import { STATUS_CODE, STATUS_MESSAGE } from '@/constants/status_code';
import { HttpException } from '@nestjs/common';

export class ResponseException extends HttpException {
  private aichStatus: string;
  constructor(message: string = STATUS_MESSAGE.INTERNAL_SERVER_ERROR) {
    const aichStatus =
      STATUS_CODE[message] || STATUS_CODE[STATUS_MESSAGE.INTERNAL_SERVER_ERROR];
    const httpStatus = Number(aichStatus.slice(0, 3));
    super(message, httpStatus);

    this.aichStatus = aichStatus;
  }

  public getAichStatus(): string {
    return this.aichStatus;
  }
}
