import { APIResponseType } from '@/interfaces/response';
import { version } from '@/libs/utils/version';
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ResponseException } from '@/libs/utils/response_exception';
import { STATUS_CODE, STATUS_MESSAGE } from '@/constants/status_code';

/* Info Murky (20240515): 使用方法: 用ResponseMessage 把要回覆的資訊放在controller上
* @Controller('example')
* @UseInterceptors(ResponseFormatInterceptor)
* 
* 然後每個api加上@ResponseMessage('要回覆的訊息')，就會自動回覆這個訊息
*  @Get('/stats')
  @ResponseMessage('Fetched Stats Succesfully')
  getUserMediaStats(@GetUser('id') userId: Types.ObjectId) {
    return this.mediaService.getUserMediaStats(userId);
  }
*/

@Injectable()
export class ResponseFormatInterceptor<T>
  implements NestInterceptor<T, APIResponseType<T>>
{
  constructor(private reflector: Reflector) {}
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<APIResponseType<T>> {
    return next.handle().pipe(
      // Info Murky (20240512): 如果成功會走這邊
      map((payload) => ({
        powerby: `powered by AICH ${version}`,
        success: true,
        code: context.switchToHttp().getResponse().statusCode,
        message:
          this.reflector.get<string>(
            'response_message', //
            context.getHandler(),
          ) || '',
        payload: payload || null,
      })),

      // Info Murky (20240512): 如果失敗會走這邊
      catchError((error) => {
        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let aichStatus = STATUS_CODE[STATUS_MESSAGE.INTERNAL_SERVER_ERROR];
        if (error instanceof ResponseException) {
          status = error.getStatus();
          const response = error.getResponse();
          message =
            typeof response === 'string' ? response : (response as any).message;
          aichStatus = error.getAichStatus();
        }

        const errorResponse: APIResponseType<null> = {
          powerby: `powered by AICH ${version}`,
          success: false,
          code: aichStatus,
          message: message,
          payload: null,
        };

        return throwError(() => new HttpException(errorResponse, status));
      }),
    );
  }
}
