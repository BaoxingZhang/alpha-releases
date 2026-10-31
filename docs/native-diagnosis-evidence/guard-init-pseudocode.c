
undefined8 FUN_100225dd8(void)

{
  long lVar1;
  undefined4 *puVar2;
  undefined8 uVar3;
  undefined8 extraout_x8;
  
  lVar1 = __ZNSt3__16chrono12system_clock3nowEv();
  if (lVar1 < 0x65e2631f26000) {
    puVar2 = (undefined4 *)(*(code *)PTR___tlv_bootstrap_10081d5f8)();
    *puVar2 = 0xffffff96;
    return 0xffffff96;
  }
  uVar3 = FUN_1001f34a8();
  puVar2 = (undefined4 *)(*(code *)PTR___tlv_bootstrap_10081d5f8)(uVar3);
  *puVar2 = (int)extraout_x8;
  return extraout_x8;
}

