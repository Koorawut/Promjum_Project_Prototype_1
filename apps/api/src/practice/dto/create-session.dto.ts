import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class CreateSessionDto {
  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsIn([2, 3])
  count?: number;
}
