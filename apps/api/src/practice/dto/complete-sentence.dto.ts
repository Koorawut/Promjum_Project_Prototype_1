import { IsString, IsUUID } from 'class-validator';

export class CompleteSentenceDto {
  @IsUUID()
  sentenceId: string;

  @IsString()
  selectedOptionKey: string;
}
