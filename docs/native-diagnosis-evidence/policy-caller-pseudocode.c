
/* WARNING: Type propagation algorithm not settling */

void FUN_1000ee3c0(undefined8 *param_1,ulong *param_2,undefined8 param_3,undefined8 param_4)

{
  ulong *puVar1;
  code *pcVar2;
  code **ppcVar3;
  undefined8 *puVar4;
  undefined8 *puVar5;
  undefined8 *puVar6;
  undefined8 *puVar7;
  undefined8 *puVar8;
  undefined8 *puVar9;
  byte *pbVar10;
  bool bVar11;
  char cVar12;
  int iVar13;
  uint uVar15;
  undefined4 uVar14;
  undefined4 *puVar16;
  undefined8 *puVar17;
  ulong uVar18;
  undefined *puVar19;
  long extraout_x1;
  long extraout_x1_00;
  long extraout_x1_01;
  undefined1 uVar20;
  undefined8 uVar21;
  undefined8 uVar22;
  undefined *puVar23;
  undefined1 uVar24;
  undefined8 uVar25;
  ulong uVar26;
  long lVar27;
  bool bVar28;
  bool bVar29;
  ulong uVar30;
  bool bVar31;
  bool bVar32;
  ulong *puVar33;
  undefined8 *puVar34;
  ulong *puVar35;
  byte *pbVar36;
  ulong uVar37;
  undefined8 *puVar38;
  undefined1 auVar39 [16];
  undefined8 in_stack_fffffffffffffa20;
  code *local_548;
  undefined8 *puStack_540;
  undefined8 local_538;
  undefined1 local_530;
  undefined1 uStack_52f;
  undefined1 uStack_52e;
  undefined4 uStack_52d;
  undefined1 uStack_529;
  undefined8 uStack_528;
  undefined8 uStack_520;
  undefined7 uStack_518;
  undefined1 uStack_511;
  ulong *local_510;
  ulong uStack_508;
  ulong local_500;
  undefined8 uStack_4f8;
  undefined8 local_4f0;
  undefined8 uStack_4e8;
  undefined8 uStack_4e0;
  undefined8 uStack_4d8;
  undefined8 local_4d0;
  long local_4c8;
  byte local_4c0;
  undefined7 uStack_4bf;
  undefined8 local_4b8;
  undefined8 local_4b0;
  undefined8 uStack_4a8;
  undefined8 local_4a0;
  void *pvStack_498;
  size_t local_490;
  void *pvStack_488;
  size_t local_480;
  void *pvStack_478;
  size_t local_470;
  void *pvStack_468;
  size_t local_460;
  undefined8 local_458;
  undefined8 uStack_450;
  undefined8 uStack_448;
  undefined8 uStack_440;
  undefined1 local_438;
  undefined1 local_437;
  undefined8 *local_430;
  code *pcStack_428;
  ulong local_420;
  code *local_418;
  ulong *local_410;
  ulong uStack_408;
  ulong local_400;
  ulong local_3f8;
  ulong local_3f0;
  ulong uStack_3e8;
  ulong local_3e0;
  ulong uStack_3d8;
  ulong local_3d0;
  undefined8 uStack_3c8;
  undefined8 uStack_3c0;
  undefined8 uStack_3b8;
  undefined8 local_3b0;
  undefined8 uStack_3a8;
  undefined8 local_3a0;
  undefined8 uStack_398;
  undefined8 local_390;
  undefined8 uStack_388;
  undefined8 local_380;
  undefined8 uStack_378;
  undefined8 local_370;
  undefined8 uStack_368;
  undefined8 local_360;
  undefined8 local_1e0;
  undefined8 *puStack_1d8;
  undefined8 *local_1d0;
  code *pcStack_1c8;
  ulong *local_1c0;
  ulong uStack_1b8;
  ulong local_1b0;
  byte *pbStack_1a8;
  ulong local_1a0;
  code *pcStack_198;
  ulong *local_190;
  ulong local_188;
  ulong uStack_180;
  ulong uStack_178;
  ulong uStack_170;
  ulong local_168;
  ulong uStack_160;
  ulong local_158;
  ulong uStack_150;
  int local_c0;
  undefined8 local_b0;
  code *pcStack_a8;
  undefined1 local_a0;
  undefined8 *local_90;
  code *pcStack_88;
  ulong local_80;
  
  uVar14 = (undefined4)((ulong)in_stack_fffffffffffffa20 >> 0x20);
  uVar30 = param_2[0x41];
  uVar26 = *param_2;
  if (uVar26 == 0xffffffffffffffff) {
LAB_1000ee42c:
    iVar13 = FUN_100225c88(0x584b5254,uVar30,0x584b4559,1);
  }
  else {
    lVar27 = uVar26 - 2;
    if (uVar26 < 2) {
      lVar27 = 0x25;
    }
    if ((lVar27 != 0x17) && (lVar27 != 0x21)) goto LAB_1000ee42c;
    iVar13 = FUN_100225dd8();
  }
  local_1e0 = CONCAT44(local_1e0._4_4_,iVar13);
  if (iVar13 != 0) {
    local_430 = &local_1e0;
    pcStack_428 = <i32_as_core[2525d0a98ae2f2bb]::fmt::Display>::fmt;
    bVar11 = true;
    local_430 = (undefined8 *)FUN_100610020(&local_430);
    FUN_100106ef8(param_1,uVar30,&local_430);
    <anyhow[a2840084f6f02700]::Error_as_core[2525d0a98ae2f2bb]::ops::drop::Drop>::drop(&local_430);
LAB_1000eeeb8:
    bVar28 = true;
LAB_1000eeebc:
    bVar29 = true;
LAB_1000eef00:
    bVar31 = true;
LAB_1000eefcc:
    bVar32 = true;
LAB_1000eefd0:
    uVar26 = param_2[0x3b];
    if (uVar26 != 0xffffffffffffffff) {
      if (uVar26 != 0) {
        __rustc[3d2f79520d6fa809]::__rust_dealloc(param_2[0x3c],uVar26,1);
      }
      if (param_2[0x3e] != 0) {
        __rustc[3d2f79520d6fa809]::__rust_dealloc(param_2[0x3f],param_2[0x3e],1);
      }
    }
    uVar26 = *param_2;
    if (uVar26 == 0xffffffffffffffff) {
      return;
    }
    lVar27 = uVar26 - 2;
    if (uVar26 < 2) {
      lVar27 = 0x25;
    }
    if (lVar27 < 0x11) {
      if (lVar27 < 7) {
        if (lVar27 == 5) {
          if (!bVar11) {
            return;
          }
          FUN_1000f09b0(param_2 + 1);
          return;
        }
        uStack_528 = (code **)CONCAT44(uStack_528._4_4_,(undefined4)uStack_528);
        uStack_520 = (ulong *)CONCAT44(uStack_520._4_4_,(undefined4)uStack_520);
        if (lVar27 == 6) {
          if (!bVar29) {
            return;
          }
LAB_1000ef3fc:
          if (param_2[1] != 0) {
            __rustc[3d2f79520d6fa809]::__rust_dealloc(param_2[2],param_2[1],1);
          }
          if (param_2[4] != 0) {
            __rustc[3d2f79520d6fa809]::__rust_dealloc(param_2[5],param_2[4],1);
          }
          if (param_2[7] != 0) {
            __rustc[3d2f79520d6fa809]::__rust_dealloc(param_2[8],param_2[7],1);
          }
          uVar26 = param_2[10];
          if (uVar26 == 0) {
            return;
          }
          uVar30 = param_2[0xb];
          goto LAB_1000ef5fc;
        }
      }
      else {
        if (lVar27 == 7) {
          if (!bVar32) {
            return;
          }
          if (param_2[1] != 0) {
            __rustc[3d2f79520d6fa809]::__rust_dealloc(param_2[2],param_2[1],1);
          }
          if (param_2[4] != 0) {
            __rustc[3d2f79520d6fa809]::__rust_dealloc(param_2[5],param_2[4],1);
          }
          FUN_1000f0b80(param_2 + 10);
          uVar26 = param_2[7];
          if (uVar26 == 0) {
            return;
          }
          uVar30 = param_2[8];
          goto LAB_1000ef5fc;
        }
        if (lVar27 == 0xb) goto LAB_1000ef5dc;
      }
    }
    else {
      if (0x20 < lVar27) {
        if (lVar27 == 0x21) {
          if (!bVar28) {
            return;
          }
          FUN_1000fda90(param_2 + 1);
          return;
        }
        if (lVar27 == 0x22) {
          uVar26 = param_2[7];
          if (uVar26 != 0xffffffffffffffff) {
            if (uVar26 != 0) {
              __rustc[3d2f79520d6fa809]::__rust_dealloc(param_2[8],uVar26,1);
            }
            if (param_2[10] != 0) {
              __rustc[3d2f79520d6fa809]::__rust_dealloc(param_2[0xb],param_2[10],1);
            }
          }
        }
        else {
          uStack_528 = (code **)CONCAT44(uStack_528._4_4_,(undefined4)uStack_528);
          uStack_520 = (ulong *)CONCAT44(uStack_520._4_4_,(undefined4)uStack_520);
          if (lVar27 != 0x26) goto LAB_1000efa54;
        }
LAB_1000ef5dc:
        if (param_2[1] != 0) {
          __rustc[3d2f79520d6fa809]::__rust_dealloc(param_2[2],param_2[1],1);
        }
        uVar26 = param_2[4];
        if (uVar26 == 0) {
          return;
        }
        uVar30 = param_2[5];
LAB_1000ef5fc:
        __rustc[3d2f79520d6fa809]::__rust_dealloc(uVar30,uVar26,1);
        return;
      }
      if (lVar27 == 0x11) goto LAB_1000ef3fc;
      uStack_528 = (code **)CONCAT44(uStack_528._4_4_,(undefined4)uStack_528);
      uStack_520 = (ulong *)CONCAT44(uStack_520._4_4_,(undefined4)uStack_520);
      if (lVar27 == 0x18) {
        if (!bVar31) {
          return;
        }
        if (param_2[4] != 0xffffffffffffffff) {
          FUN_1000fd774();
        }
        uVar26 = param_2[1];
        if (uVar26 == 0) {
          return;
        }
        uVar30 = param_2[2];
        goto LAB_1000ef5fc;
      }
    }
    goto LAB_1000efa54;
  }
  uVar26 = *param_2;
  if (uVar26 == 0xffffffffffffffff) {
    bVar11 = false;
    puVar23 = &DAT_1006319a7;
    uVar24 = 10;
    uVar20 = 0x20;
    puVar19 = &DAT_100631987;
switchD_1000ee4b4_caseD_8:
    FUN_100106bcc(param_1,uVar30,puVar19,uVar20,puVar23,uVar24,bVar11);
    goto LAB_1000ef9cc;
  }
  bVar11 = false;
  lVar27 = uVar26 - 2;
  if (uVar26 < 2) {
    lVar27 = 0x25;
  }
  puVar23 = &DAT_1006319a7;
  puVar19 = &DAT_100631987;
  uVar24 = 10;
  uVar20 = 0x20;
  switch(lVar27) {
  case 5:
    if (param_2[1] == 0xffffffffffffffff) {
      bVar11 = false;
      FUN_100106bcc(param_1,uVar30,&BYTE_10063173d,0x23,&BYTE_100631760,10,0);
      goto LAB_1000eeeb8;
    }
    uStack_150 = param_2[0x13];
    local_158 = param_2[0x12];
    local_190 = (ulong *)param_2[0xb];
    pcStack_198 = (code *)param_2[10];
    uStack_180 = param_2[0xd];
    local_188 = param_2[0xc];
    uStack_170 = param_2[0xf];
    uStack_178 = param_2[0xe];
    uStack_160 = param_2[0x11];
    local_168 = param_2[0x10];
    local_1d0 = (undefined8 *)param_2[3];
    puStack_1d8 = (undefined8 *)param_2[2];
    local_1c0 = (ulong *)param_2[5];
    pcStack_1c8 = (code *)param_2[4];
    local_1b0 = param_2[7];
    uStack_1b8 = param_2[6];
    local_1a0 = param_2[9];
    pbStack_1a8 = (byte *)param_2[8];
    local_1e0 = param_2[1];
    FUN_10017ad6c(&local_430,param_4,&local_1e0);
    if (local_430 != (undefined8 *)0xffffffffffffffff) {
      param_1[0x27] = local_380;
      param_1[0x1a] = uStack_3e8;
      param_1[0x19] = local_3f0;
      param_1[0x1c] = uStack_3d8;
      param_1[0x1b] = local_3e0;
      param_1[0x1e] = uStack_3c8;
      param_1[0x1d] = local_3d0;
      param_1[0x20] = uStack_3b8;
      param_1[0x1f] = uStack_3c0;
      param_1[0x12] = pcStack_428;
      param_1[0x11] = local_430;
      param_1[0x14] = local_418;
      param_1[0x13] = local_420;
      param_1[0x16] = uStack_408;
      param_1[0x15] = local_410;
      param_1[0x18] = local_3f8;
      param_1[0x17] = local_400;
      param_1[0x22] = uStack_3a8;
      param_1[0x21] = local_3b0;
      param_1[0x24] = uStack_398;
      param_1[0x23] = local_3a0;
      param_1[0x26] = uStack_388;
      param_1[0x25] = local_390;
      param_1[0x47] = uVar30;
      *param_1 = 0xffffffffffffffff;
      *(undefined4 *)(param_1 + 0x48) = 2;
      param_1[0x10] = 0x8000000000000005;
      uVar26 = param_2[0x3b];
      break;
    }
    uVar26 = (ulong)pcStack_428 & 0xff;
    FUN_100106bcc(param_1,uVar30,(&PTR_s_NATIVE_DEVICE_PROOF_WINDOWS_ONLY_1007c8540)[uVar26],
                  (&DAT_1006334a0)[uVar26],(&PTR_DAT_1007c8590)[uVar26],(&DAT_1006334b0)[uVar26],
                  uVar26 == 3 || uVar26 == 8);
    goto LAB_1000ef9cc;
  case 6:
    pcStack_198 = (code *)param_2[10];
    local_1a0 = param_2[9];
    local_188 = param_2[0xc];
    local_190 = (ulong *)param_2[0xb];
    uStack_180 = param_2[0xd];
    puStack_1d8 = (undefined8 *)param_2[2];
    local_1e0 = param_2[1];
    pcStack_1c8 = (code *)param_2[4];
    local_1d0 = (undefined8 *)param_2[3];
    uStack_1b8 = param_2[6];
    local_1c0 = (ulong *)param_2[5];
    pbStack_1a8 = (byte *)param_2[8];
    local_1b0 = param_2[7];
    if (uStack_180 == 0) {
      FUN_100106bcc(param_1,uVar30,&BYTE_10063176a,0x27,&BYTE_100631760,10,0);
      FUN_1000fda1c(&local_1e0);
      bVar29 = false;
      bVar28 = true;
      bVar11 = true;
      goto LAB_1000eef00;
    }
    auVar39 = FUN_100178b7c();
    local_510 = &uStack_180;
    uStack_528 = &pcStack_1c8;
    uStack_520 = &local_1b0;
    local_530 = SUB81(&local_1e0,0);
    uStack_52f = (undefined1)((ulong)&local_1e0 >> 8);
    uStack_52e = (undefined1)((ulong)&local_1e0 >> 0x10);
    uStack_52d = (undefined4)((ulong)&local_1e0 >> 0x18);
    uStack_529 = (undefined1)((ulong)&local_1e0 >> 0x38);
    uStack_518 = SUB87(&pcStack_198,0);
    uStack_511 = (undefined1)((ulong)&pcStack_198 >> 0x38);
    if (auVar39._0_8_ == 1) {
      local_430 = (undefined8 *)0xffffffffffffffff;
      pcStack_428 = auVar39._8_8_;
LAB_1000ef378:
      FUN_10010f1d0(&local_530,&pcStack_428);
      ppcVar3 = uStack_528;
      uVar26 = FUN_10010f7e0(&BYTE_100631791,7,uStack_528,uStack_520);
      if ((uVar26 & 1) == 0) {
        lVar27 = CONCAT17(uStack_529,
                          CONCAT43(uStack_52d,CONCAT12(uStack_52e,CONCAT11(uStack_52f,local_530))));
        if (lVar27 != 0) {
          __rustc[3d2f79520d6fa809]::__rust_dealloc(ppcVar3,lVar27,1);
        }
        FUN_100106bcc(param_1,uVar30,&BYTE_100631798,0x24,&BYTE_1006317bc,9,0);
        if (local_430 == (undefined8 *)0xffffffffffffffff) {
          <anyhow[a2840084f6f02700]::Error_as_core[2525d0a98ae2f2bb]::ops::drop::Drop>::drop
                    (&pcStack_428);
        }
      }
      else {
        lVar27 = CONCAT17(uStack_529,
                          CONCAT43(uStack_52d,CONCAT12(uStack_52e,CONCAT11(uStack_52f,local_530))));
        if (lVar27 != 0) {
          __rustc[3d2f79520d6fa809]::__rust_dealloc(ppcVar3,lVar27,1);
        }
        local_530 = SUB81(pcStack_428,0);
        uStack_52f = (undefined1)((ulong)pcStack_428 >> 8);
        uStack_52e = (undefined1)((ulong)pcStack_428 >> 0x10);
        uStack_52d = (undefined4)((ulong)pcStack_428 >> 0x18);
        uStack_529 = (undefined1)((ulong)pcStack_428 >> 0x38);
        FUN_100106bcc(param_1,uVar30,&BYTE_10063176a,0x27,&BYTE_100631760,10,0);
        <anyhow[a2840084f6f02700]::Error_as_core[2525d0a98ae2f2bb]::ops::drop::Drop>::drop
                  (&local_530);
      }
    }
    else {
      FUN_100100328(&local_430,&local_530);
      if (local_430 == (undefined8 *)0xffffffffffffffff) goto LAB_1000ef378;
      param_1[0x2b] = local_360;
      param_1[0x1a] = uStack_3e8;
      param_1[0x19] = local_3f0;
      param_1[0x1c] = uStack_3d8;
      param_1[0x1b] = local_3e0;
      param_1[0x1e] = uStack_3c8;
      param_1[0x1d] = local_3d0;
      param_1[0x20] = uStack_3b8;
      param_1[0x1f] = uStack_3c0;
      param_1[0x12] = pcStack_428;
      param_1[0x11] = local_430;
      param_1[0x14] = local_418;
      param_1[0x13] = local_420;
      param_1[0x16] = uStack_408;
      param_1[0x15] = local_410;
      param_1[0x18] = local_3f8;
      param_1[0x17] = local_400;
      param_1[0x22] = uStack_3a8;
      param_1[0x21] = local_3b0;
      param_1[0x24] = uStack_398;
      param_1[0x23] = local_3a0;
      param_1[0x26] = uStack_388;
      param_1[0x25] = local_390;
      param_1[0x28] = uStack_378;
      param_1[0x27] = local_380;
      param_1[0x2a] = uStack_368;
      param_1[0x29] = local_370;
      param_1[0x47] = uVar30;
      *param_1 = 0xffffffffffffffff;
      *(undefined4 *)(param_1 + 0x48) = 2;
      param_1[0x10] = 0x8000000000000006;
    }
    FUN_1000fda1c(&local_1e0);
    uVar26 = param_2[0x3b];
    break;
  case 7:
    _memcpy(&local_1e0,param_2 + 1,0x128);
    uVar26 = local_1a0;
    pbVar10 = pbStack_1a8;
    FUN_10016334c(pbStack_1a8,local_1a0);
    pbVar36 = &BYTE_1006317c5;
    if (extraout_x1 != 0) {
      pbVar36 = pbVar10;
    }
    uVar18 = 8;
    if (extraout_x1 != 0) {
      uVar18 = uVar26;
    }
    iVar13 = 0x3c;
    if (local_c0 != 0) {
      iVar13 = local_c0;
    }
    if (pcStack_198 == (code *)0xffffffffffffffff) {
      FUN_100106bcc(param_1,uVar30,&BYTE_1006317cd,0x1f,&BYTE_100631760,10,0);
    }
    else {
      if ((uStack_180 == 0xffffffffffffffff) ||
         (cVar12 = FUN_100100254(&pcStack_198,&uStack_180), cVar12 != '\x01')) {
        FUN_100106bcc(param_1,uVar30,&BYTE_1006317cd,0x1f,&BYTE_100631760,10,0);
        FUN_1000fdb9c(&local_1e0);
        bVar32 = false;
        bVar28 = true;
        bVar11 = true;
        bVar29 = true;
        bVar31 = true;
        goto LAB_1000eefd0;
      }
      FUN_10015ed8c(&local_430,param_3,puStack_1d8,local_1d0,pbVar36,uVar18,local_1c0,uStack_1b8,
                    &pcStack_198,CONCAT44(uVar14,iVar13));
      if (local_430 == (undefined8 *)0xffffffffffffffff) {
        local_530 = SUB81(pcStack_428,0);
        uStack_52f = (undefined1)((ulong)pcStack_428 >> 8);
        uStack_52e = (undefined1)((ulong)pcStack_428 >> 0x10);
        uStack_52d = (undefined4)((ulong)pcStack_428 >> 0x18);
        uStack_529 = (undefined1)((ulong)pcStack_428 >> 0x38);
        FUN_1001079b8(param_1,uVar30,&local_530);
        <anyhow[a2840084f6f02700]::Error_as_core[2525d0a98ae2f2bb]::ops::drop::Drop>::drop
                  (&local_530);
      }
      else {
        _memcpy(param_1 + 0x10,&local_430,0x1b8);
        param_1[0x47] = uVar30;
        *param_1 = 0xffffffffffffffff;
        *(undefined4 *)(param_1 + 0x48) = 2;
      }
    }
    FUN_1000fdb9c(&local_1e0);
    uVar26 = param_2[0x3b];
    break;
  default:
    goto switchD_1000ee4b4_caseD_8;
  case 0xb:
    uVar18 = param_2[6];
    puVar35 = (ulong *)param_2[5];
    uVar26 = param_2[1];
    uStack_528._0_4_ = (undefined4)param_2[2];
    uStack_528._4_4_ = (undefined4)(param_2[2] >> 0x20);
    local_530 = (undefined1)uVar26;
    uStack_52f = (undefined1)(uVar26 >> 8);
    uStack_52e = (undefined1)(uVar26 >> 0x10);
    uStack_52d = (undefined4)(uVar26 >> 0x18);
    uStack_529 = (undefined1)(uVar26 >> 0x38);
    uStack_518 = (undefined7)param_2[4];
    uStack_511 = (undefined1)(param_2[4] >> 0x38);
    uStack_520._0_4_ = (undefined4)param_2[3];
    uStack_520._4_4_ = (undefined4)(param_2[3] >> 0x20);
    local_500 = param_2[7];
    local_510 = puVar35;
    uStack_508 = uVar18;
    FUN_10016334c(puVar35,uVar18);
    if (extraout_x1_00 == 0) {
      auVar39._8_8_ = 0x13;
      auVar39._0_8_ = &DAT_1006317ec;
    }
    else {
      auVar39 = FUN_10016334c(puVar35,uVar18);
    }
    uVar21 = CONCAT44(uStack_528._4_4_,(undefined4)uStack_528);
    FUN_10015e8cc(&local_1e0,param_3,uVar21,CONCAT44(uStack_520._4_4_,(undefined4)uStack_520),
                  auVar39._0_8_,auVar39._8_8_,local_500 & 0xffffffff);
    if (local_1e0 == 0xffffffffffffffff) {
      local_b0 = puStack_1d8;
      FUN_10010f1d0(&local_90,&local_b0);
      uVar26 = local_80;
      pcVar2 = pcStack_88;
      FUN_10010718c(&local_430,uVar30,pcStack_88,local_80);
      if (local_430 == (undefined8 *)0xfffffffffffffffe) {
        uVar18 = FUN_10010f7e0(&DAT_1006317ff,0x23,pcVar2,uVar26);
        if ((uVar18 & 1) == 0) {
          uVar18 = FUN_10010f7e0(&DAT_100631822,0x1f,pcVar2,uVar26);
          pbVar36 = &DAT_100631891;
          if ((uVar18 & 1) == 0) {
            uVar15 = FUN_10010f7e0(&DAT_100631841,0x27,pcVar2,uVar26);
            bVar11 = uVar15 == 0;
            puVar34 = &DAT_100631841;
            if (bVar11) {
              puVar34 = (undefined8 *)&DAT_100631868;
            }
            uVar22 = 0x27;
            if (bVar11) {
              uVar22 = 0x20;
              pbVar36 = &DAT_100631888;
            }
            uVar25 = 0xd;
            if (bVar11) {
              uVar25 = 9;
            }
            uVar15 = uVar15 ^ 1;
          }
          else {
            uVar15 = 0;
            uVar25 = 0xd;
            uVar22 = 0x1f;
            puVar34 = &DAT_100631822;
          }
        }
        else {
          uVar15 = 0;
          pbVar36 = &BYTE_100631760;
          uVar25 = 10;
          uVar22 = 0x23;
          puVar34 = (undefined8 *)&DAT_1006317ff;
        }
        FUN_100106bcc(param_1,uVar30,puVar34,uVar22,pbVar36,uVar25,uVar15);
      }
      else {
        _memcpy(param_1,&local_430,0x248);
      }
      if (local_90 != (undefined8 *)0x0) {
        __rustc[3d2f79520d6fa809]::__rust_dealloc(pcVar2,local_90,1);
      }
      <anyhow[a2840084f6f02700]::Error_as_core[2525d0a98ae2f2bb]::ops::drop::Drop>::drop(&local_b0);
    }
    else {
      param_1[0x1a] = pcStack_198;
      param_1[0x19] = local_1a0;
      param_1[0x1c] = local_188;
      param_1[0x1b] = local_190;
      param_1[0x12] = puStack_1d8;
      param_1[0x11] = local_1e0;
      param_1[0x14] = pcStack_1c8;
      param_1[0x13] = local_1d0;
      param_1[0x16] = uStack_1b8;
      param_1[0x15] = local_1c0;
      param_1[0x1d] = uStack_180;
      param_1[0x18] = pbStack_1a8;
      param_1[0x17] = local_1b0;
      param_1[0x47] = uVar30;
      *param_1 = 0xffffffffffffffff;
      *(undefined4 *)(param_1 + 0x48) = 2;
      param_1[0x10] = 0x800000000000000b;
    }
    lVar27 = CONCAT17(uStack_529,
                      CONCAT43(uStack_52d,CONCAT12(uStack_52e,CONCAT11(uStack_52f,local_530))));
    if (lVar27 != 0) {
      __rustc[3d2f79520d6fa809]::__rust_dealloc(uVar21,lVar27,1);
    }
    pcVar2 = (code *)CONCAT17(uStack_511,uStack_518);
    goto joined_r0x0001000ef1fc;
  case 0x11:
    uVar26 = param_2[6];
    puVar33 = (ulong *)param_2[5];
    pcStack_1c8 = (code *)param_2[4];
    puVar34 = (undefined8 *)param_2[3];
    puVar38 = (undefined8 *)param_2[2];
    local_1e0 = param_2[1];
    uVar18 = param_2[0xc];
    puVar35 = (ulong *)param_2[0xb];
    pcStack_198 = (code *)param_2[10];
    uVar37 = param_2[9];
    pbVar36 = (byte *)param_2[8];
    local_1b0 = param_2[7];
    uStack_180 = param_2[0xd];
    puStack_1d8 = puVar38;
    local_1d0 = puVar34;
    local_1c0 = puVar33;
    uStack_1b8 = uVar26;
    pbStack_1a8 = pbVar36;
    local_1a0 = uVar37;
    local_190 = puVar35;
    local_188 = uVar18;
    FUN_10016334c(puVar35,uVar18);
    puVar1 = (ulong *)0x0;
    if (extraout_x1_01 != 0) {
      puVar1 = puVar35;
    }
    FUN_10015f598(&local_430,param_3,puVar38,puVar34,puVar33,uVar26,pbVar36,uVar37,puVar1,uVar18,
                  (undefined4)uStack_180);
    if (local_430 == (undefined8 *)0xffffffffffffffff) {
      local_530 = SUB81(pcStack_428,0);
      uStack_52f = (undefined1)((ulong)pcStack_428 >> 8);
      uStack_52e = (undefined1)((ulong)pcStack_428 >> 0x10);
      uStack_52d = (undefined4)((ulong)pcStack_428 >> 0x18);
      uStack_529 = (undefined1)((ulong)pcStack_428 >> 0x38);
      FUN_1001079b8(param_1,uVar30,&local_530);
      <anyhow[a2840084f6f02700]::Error_as_core[2525d0a98ae2f2bb]::ops::drop::Drop>::drop(&local_530)
      ;
    }
    else {
      param_1[0x1a] = uStack_3e8;
      param_1[0x19] = local_3f0;
      param_1[0x1c] = uStack_3d8;
      param_1[0x1b] = local_3e0;
      param_1[0x1e] = uStack_3c8;
      param_1[0x1d] = local_3d0;
      param_1[0x20] = uStack_3b8;
      param_1[0x1f] = uStack_3c0;
      param_1[0x12] = pcStack_428;
      param_1[0x11] = local_430;
      param_1[0x14] = local_418;
      param_1[0x13] = local_420;
      param_1[0x16] = uStack_408;
      param_1[0x15] = local_410;
      param_1[0x23] = local_3a0;
      param_1[0x18] = local_3f8;
      param_1[0x17] = local_400;
      param_1[0x22] = uStack_3a8;
      param_1[0x21] = local_3b0;
      param_1[0x47] = uVar30;
      *param_1 = 0xffffffffffffffff;
      *(undefined4 *)(param_1 + 0x48) = 2;
      param_1[0x10] = 0x8000000000000011;
    }
    if (local_1e0 != 0) {
      __rustc[3d2f79520d6fa809]::__rust_dealloc(puVar38,local_1e0,1);
    }
    if (pcStack_1c8 != (code *)0x0) {
      __rustc[3d2f79520d6fa809]::__rust_dealloc(puVar33,pcStack_1c8,1);
    }
    pcVar2 = pcStack_198;
    if (local_1b0 != 0) {
      __rustc[3d2f79520d6fa809]::__rust_dealloc(pbVar36,local_1b0,1);
      pcVar2 = pcStack_198;
    }
    goto joined_r0x0001000ef1fc;
  case 0x17:
    FUN_10017bfac(&local_4c8,param_4);
    if (local_4c8 == -1) {
      uVar26 = (ulong)local_4c0;
      puVar19 = (&PTR_s_NATIVE_DEVICE_PROOF_WINDOWS_ONLY_1007c8540)[uVar26];
      uVar20 = (&DAT_1006334a0)[uVar26];
      uVar24 = (&DAT_1006334b0)[uVar26];
      puVar23 = (&PTR_DAT_1007c8590)[uVar26];
      bVar11 = uVar26 == 3 || uVar26 == 8;
      goto switchD_1000ee4b4_caseD_8;
    }
    local_430 = (undefined8 *)0xffffffffffffffff;
    uVar14 = FUN_100106ee4(local_437);
    __rustc[3d2f79520d6fa809]::__rust_no_alloc_shim_is_unstable_v2();
    puVar16 = (undefined4 *)__rustc[3d2f79520d6fa809]::__rust_alloc(5,1);
    if (puVar16 == (undefined4 *)0x0) {
                    /* WARNING: Subroutine does not return */
      alloc[654f9ea51da0cd84]::raw_vec::handle_error(1,5);
    }
    *(undefined1 *)(puVar16 + 1) = 0x66;
    *puVar16 = 0x6f6f7270;
    FUN_10018dca8(&local_1e0,local_490,0,1,1);
    puVar38 = local_1d0;
    puVar34 = puStack_1d8;
    if (local_1e0 != 0) {
                    /* WARNING: Subroutine does not return */
      alloc[654f9ea51da0cd84]::raw_vec::handle_error(puStack_1d8,local_1d0);
    }
    if (local_490 != 0) {
      _memcpy(local_1d0,pvStack_498,local_490);
    }
    FUN_10018dca8(&local_1e0,local_480,0,1,1);
    puVar7 = local_1d0;
    puVar4 = puStack_1d8;
    if (local_1e0 != 0) {
                    /* WARNING: Subroutine does not return */
      alloc[654f9ea51da0cd84]::raw_vec::handle_error(puStack_1d8,local_1d0);
    }
    if (local_480 != 0) {
      _memcpy(local_1d0,pvStack_488,local_480);
    }
    FUN_10018dca8(&local_1e0,local_470,0,1,1);
    puVar8 = local_1d0;
    puVar5 = puStack_1d8;
    if (local_1e0 != 0) {
                    /* WARNING: Subroutine does not return */
      alloc[654f9ea51da0cd84]::raw_vec::handle_error(puStack_1d8,local_1d0);
    }
    if (local_470 != 0) {
      _memcpy(local_1d0,pvStack_478,local_470);
    }
    FUN_10018dca8(&local_1e0,local_460,0,1,1);
    puVar9 = local_1d0;
    puVar6 = puStack_1d8;
    if (local_1e0 != 0) {
                    /* WARNING: Subroutine does not return */
      alloc[654f9ea51da0cd84]::raw_vec::handle_error(puStack_1d8,local_1d0);
    }
    if (local_460 != 0) {
      _memcpy(local_1d0,pvStack_468,local_460);
    }
    __rustc[3d2f79520d6fa809]::__rust_no_alloc_shim_is_unstable_v2();
    puVar17 = (undefined8 *)__rustc[3d2f79520d6fa809]::__rust_alloc(0x20,1);
    if (puVar17 == (undefined8 *)0x0) {
                    /* WARNING: Subroutine does not return */
      alloc[654f9ea51da0cd84]::raw_vec::handle_error(1,0x20);
    }
    puVar17[1] = uStack_450;
    *puVar17 = local_458;
    puVar17[3] = uStack_440;
    puVar17[2] = uStack_448;
    param_1[0x20] = puVar4;
    param_1[0x21] = puVar7;
    param_1[0x22] = local_480;
    param_1[0x23] = puVar5;
    param_1[0x24] = puVar8;
    param_1[0x25] = local_470;
    param_1[0x26] = puVar6;
    param_1[0x27] = puVar9;
    param_1[0x28] = local_460;
    param_1[0x47] = uVar30;
    param_1[5] = uStack_408;
    param_1[4] = local_410;
    param_1[7] = local_3f8;
    param_1[6] = local_400;
    param_1[1] = pcStack_428;
    *param_1 = local_430;
    param_1[3] = local_418;
    param_1[2] = local_420;
    param_1[0xd] = uStack_3c8;
    param_1[0xc] = local_3d0;
    param_1[0xf] = uStack_3b8;
    param_1[0xe] = uStack_3c0;
    param_1[9] = uStack_3e8;
    param_1[8] = local_3f0;
    param_1[0xb] = uStack_3d8;
    param_1[10] = local_3e0;
    *(undefined4 *)(param_1 + 0x48) = 2;
    param_1[0x10] = 0x8000000000000017;
    param_1[0x11] = local_4c8;
    param_1[0x12] = CONCAT71(uStack_4bf,local_4c0);
    param_1[0x13] = local_4b8;
    param_1[0x14] = 5;
    param_1[0x15] = puVar16;
    param_1[0x16] = 5;
    param_1[0x17] = puVar34;
    param_1[0x18] = puVar38;
    param_1[0x19] = local_490;
    param_1[0x1a] = local_4b0;
    param_1[0x1b] = uStack_4a8;
    param_1[0x1c] = local_4a0;
    param_1[0x1d] = 0x20;
    param_1[0x1e] = puVar17;
    param_1[0x1f] = 0x20;
    *(undefined4 *)(param_1 + 0x29) = uVar14;
    *(undefined1 *)((long)param_1 + 0x14c) = local_438;
    uVar26 = param_2[0x3b];
    break;
  case 0x18:
    puStack_1d8 = (undefined8 *)param_2[2];
    local_1e0 = param_2[1];
    pcStack_1c8 = (code *)param_2[4];
    local_1d0 = (undefined8 *)param_2[3];
    pcStack_198 = (code *)param_2[10];
    local_1a0 = param_2[9];
    uStack_1b8 = param_2[6];
    local_1c0 = (ulong *)param_2[5];
    pbStack_1a8 = (byte *)param_2[8];
    local_1b0 = param_2[7];
    auVar39 = FUN_10016334c(puStack_1d8,local_1d0);
    lVar27 = auVar39._8_8_;
    if (pcStack_1c8 == (code *)0xffffffffffffffff) {
      puVar23 = &DAT_10063189e;
      uVar21 = 0x1e;
LAB_1000eef98:
      FUN_100106bcc(param_1,uVar30,puVar23,uVar21,&BYTE_100631760,10,0);
    }
    else {
      if ((lVar27 - 0x81U < 0xffffffffffffff80) ||
         (uVar26 = FUN_10010eb50(auVar39._0_8_,lVar27), (uVar26 & 1) != 0)) {
        puVar23 = &DAT_1006318f0;
        uVar21 = 0x1a;
        goto LAB_1000eef98;
      }
      if ((local_1a0 == 0x13) &&
         ((*(long *)pbStack_1a8 == 0x692e746168636577 &&
          *(long *)(pbStack_1a8 + 8) == 0x79656b2d6567616d) &&
          *(long *)(pbStack_1a8 + 0xb) == 0x31762e79656b2d65)) {
        local_90 = (undefined8 *)0x0;
        pcStack_88 = (code *)0x4;
        local_80 = 0;
LAB_1000efa6c:
        FUN_10015e070(&local_b0,param_3,&pcStack_1c8,auVar39._0_8_,lVar27);
        if ((char)local_b0 == '\0') {
          param_1[0x47] = uVar30;
          *param_1 = 0xffffffffffffffff;
          *(undefined4 *)(param_1 + 0x48) = 2;
          param_1[0x10] = 0x8000000000000018;
          *(undefined1 *)(param_1 + 0x11) = local_b0._1_1_;
        }
        else {
          local_548 = pcStack_a8;
          FUN_10010f1d0(&local_530,&local_548);
          uVar21 = CONCAT44(uStack_528._4_4_,(undefined4)uStack_528);
          FUN_10010718c(&local_430,uVar30,uVar21,CONCAT44(uStack_520._4_4_,(undefined4)uStack_520));
          if (local_430 == (undefined8 *)0xfffffffffffffffe) {
            lVar27 = CONCAT17(uStack_529,
                              CONCAT43(uStack_52d,
                                       CONCAT12(uStack_52e,CONCAT11(uStack_52f,local_530))));
            if (lVar27 != 0) {
              __rustc[3d2f79520d6fa809]::__rust_dealloc(uVar21,lVar27,1);
            }
            FUN_100106bcc(param_1,uVar30,&DAT_1006318d6,0x1a,&BYTE_1006317bc,9,0);
          }
          else {
            _memcpy(param_1,&local_430,0x248);
            lVar27 = CONCAT17(uStack_529,
                              CONCAT43(uStack_52d,
                                       CONCAT12(uStack_52e,CONCAT11(uStack_52f,local_530))));
            if (lVar27 != 0) {
              __rustc[3d2f79520d6fa809]::__rust_dealloc(uVar21,lVar27,1);
            }
          }
          <anyhow[a2840084f6f02700]::Error_as_core[2525d0a98ae2f2bb]::ops::drop::Drop>::drop
                    (&local_548);
        }
        FUN_1000f26ec(&local_90);
        FUN_1000fd9b4(&local_1e0);
        uVar26 = param_2[0x3b];
        break;
      }
      FUN_1001d1578(&local_430,&pcStack_1c8);
      if (local_430 != (undefined8 *)0xffffffffffffffff) {
        pcStack_88 = pcStack_428;
        local_90 = local_430;
        local_80 = local_420;
        goto LAB_1000efa6c;
      }
      FUN_100106bcc(param_1,uVar30,&DAT_1006318bc,0x1a,"conflict",8,0);
      if (local_430 == (undefined8 *)0xffffffffffffffff) {
        FUN_1000f2140(&local_430);
      }
    }
    FUN_1000fd9b4(&local_1e0);
    bVar31 = false;
    bVar28 = true;
    bVar11 = true;
    bVar29 = true;
    goto LAB_1000eefcc;
  case 0x21:
    uStack_160 = param_2[0x11];
    pcStack_198 = (code *)param_2[10];
    local_1a0 = param_2[9];
    local_188 = param_2[0xc];
    local_190 = (ulong *)param_2[0xb];
    uStack_178 = param_2[0xe];
    uStack_180 = param_2[0xd];
    local_168 = param_2[0x10];
    uStack_170 = param_2[0xf];
    puStack_1d8 = (undefined8 *)param_2[2];
    local_1e0 = param_2[1];
    pcStack_1c8 = (code *)param_2[4];
    local_1d0 = (undefined8 *)param_2[3];
    uStack_1b8 = param_2[6];
    local_1c0 = (ulong *)param_2[5];
    pbStack_1a8 = (byte *)param_2[8];
    local_1b0 = param_2[7];
    local_430 = (undefined8 *)FUN_1001d00a0(&local_1e0);
    if (local_430 != (undefined8 *)0x0) {
      <anyhow[a2840084f6f02700]::Error_as_core[2525d0a98ae2f2bb]::ops::drop::Drop>::drop(&local_430)
      ;
      FUN_100106bcc(param_1,uVar30,&DAT_100631926,0x20,&DAT_10062cb20,8,0);
LAB_1000eeaa0:
      FUN_1000fda90(&local_1e0);
      bVar28 = false;
      bVar11 = true;
      goto LAB_1000eeebc;
    }
    FUN_1001627ec(&local_530,param_3,&local_1e0);
    if (CONCAT17(uStack_529,CONCAT43(uStack_52d,CONCAT12(uStack_52e,CONCAT11(uStack_52f,local_530)))
                ) == -1) {
      local_b0 = (undefined8 *)CONCAT44(uStack_528._4_4_,(undefined4)uStack_528);
      FUN_10010f1d0(&local_90,&local_b0);
      pcVar2 = pcStack_88;
      FUN_10010718c(&local_430,uVar30,pcStack_88,local_80);
      if (local_430 != (undefined8 *)0xfffffffffffffffe) {
        _memcpy(param_1,&local_430,0x248);
        if (local_90 != (undefined8 *)0x0) {
          __rustc[3d2f79520d6fa809]::__rust_dealloc(pcVar2,local_90,1);
        }
        <anyhow[a2840084f6f02700]::Error_as_core[2525d0a98ae2f2bb]::ops::drop::Drop>::drop
                  (&local_b0);
        goto LAB_1000eeaa0;
      }
      if (local_90 != (undefined8 *)0x0) {
        __rustc[3d2f79520d6fa809]::__rust_dealloc(pcVar2,local_90,1);
      }
      FUN_100106bcc(param_1,uVar30,&DAT_10063190a,0x1c,&BYTE_1006317bc,9,0);
      <anyhow[a2840084f6f02700]::Error_as_core[2525d0a98ae2f2bb]::ops::drop::Drop>::drop(&local_b0);
    }
    else {
      param_1[0x1a] = uStack_4e8;
      param_1[0x19] = local_4f0;
      param_1[0x1c] = uStack_4d8;
      param_1[0x1b] = uStack_4e0;
      param_1[0x12] = CONCAT44(uStack_528._4_4_,(undefined4)uStack_528);
      param_1[0x11] =
           CONCAT17(uStack_529,
                    CONCAT43(uStack_52d,CONCAT12(uStack_52e,CONCAT11(uStack_52f,local_530))));
      param_1[0x14] = CONCAT17(uStack_511,uStack_518);
      param_1[0x13] = CONCAT44(uStack_520._4_4_,(undefined4)uStack_520);
      param_1[0x16] = uStack_508;
      param_1[0x15] = local_510;
      param_1[0x1d] = local_4d0;
      param_1[0x18] = uStack_4f8;
      param_1[0x17] = local_500;
      param_1[0x47] = uVar30;
      *param_1 = 0xffffffffffffffff;
      *(undefined4 *)(param_1 + 0x48) = 2;
      param_1[0x10] = 0x8000000000000021;
    }
    FUN_1000fda90(&local_1e0);
    uVar26 = param_2[0x3b];
    break;
  case 0x22:
    uStack_3e8 = param_2[10];
    local_3f0 = param_2[9];
    uStack_3d8 = param_2[0xc];
    local_3e0 = param_2[0xb];
    local_3d0 = param_2[0xd];
    pcStack_428 = (code *)param_2[2];
    local_430 = (undefined8 *)param_2[1];
    local_418 = (code *)param_2[4];
    local_420 = param_2[3];
    uStack_408 = param_2[6];
    local_410 = (ulong *)param_2[5];
    local_3f8 = param_2[8];
    uVar26 = param_2[7];
    local_400 = uVar26;
    if (uVar26 == 0xffffffffffffffff) {
      puStack_540 = (undefined8 *)FUN_100612868("USER_DATA_SECRET_INVALID",0x18);
LAB_1000eece4:
      local_548 = (code *)0xffffffffffffffff;
LAB_1000ef800:
      FUN_100106bcc(param_1,uVar30,&DAT_100631946,0x1c,&DAT_10062cb20,8,0);
      if (local_548 == (code *)0xffffffffffffffff) {
        FUN_1000f21bc(&local_548);
      }
      if (uVar26 != 0xffffffffffffffff) goto LAB_1000ef844;
    }
    else {
      if (uStack_408 != 8) {
        if ((uStack_408 != 5) ||
           (*(char *)((long)local_410 + 4) != 'e' || (int)*local_410 != 0x67616d69)) {
LAB_1000eecd4:
          puStack_540 = (undefined8 *)FUN_100612868("USER_DATA_SECRET_INVALID",0x18);
          goto LAB_1000eece4;
        }
        FUN_10015e5fc(&local_1e0,param_3,&local_400,pcStack_428,local_420);
        if ((char)local_1e0 == '\0') {
          local_530 = (undefined1)(local_1e0 >> 8);
          uStack_52f = (undefined1)(local_1e0 >> 0x10);
          uStack_52e = (undefined1)(local_1e0 >> 0x18);
          uStack_52d = local_1e0._4_4_;
          pcStack_88 = pcStack_1c8;
          local_90 = local_1d0;
          local_80 = CONCAT71(local_80._1_7_,local_1c0._0_1_);
          uStack_529 = SUB81(puStack_1d8,0);
          uStack_528._0_4_ = (undefined4)((ulong)puStack_1d8 >> 8);
          uStack_528._4_3_ = (undefined3)((ulong)puStack_1d8 >> 0x28);
          uStack_520._7_1_ = SUB81(pcStack_1c8,0);
          uStack_518 = (undefined7)((ulong)pcStack_1c8 >> 8);
          uStack_528._7_1_ = SUB81(local_1d0,0);
          uStack_520._0_4_ = (undefined4)((ulong)local_1d0 >> 8);
          uStack_520._4_3_ = (undefined3)((ulong)local_1d0 >> 0x28);
          uStack_511 = local_1c0._0_1_;
          __rustc[3d2f79520d6fa809]::__rust_no_alloc_shim_is_unstable_v2();
          puStack_540 = (undefined8 *)__rustc[3d2f79520d6fa809]::__rust_alloc_zeroed(0x20,1);
          if (puStack_540 == (undefined8 *)0x0) {
                    /* WARNING: Subroutine does not return */
            alloc[654f9ea51da0cd84]::raw_vec::handle_error(1,0x20);
          }
          *(undefined1 *)puStack_540 = 1;
          *(undefined1 *)((long)puStack_540 + 1) = uStack_52f;
          *(undefined2 *)((long)puStack_540 + 2) = 0x110;
          *(ulong *)((long)puStack_540 + 0xc) = CONCAT44((undefined4)uStack_520,uStack_528._4_4_);
          *(ulong *)((long)puStack_540 + 4) =
               CONCAT44((undefined4)uStack_528,CONCAT13(uStack_529,uStack_52d._1_3_));
          local_1e0 = 0;
          puStack_1d8 = (undefined8 *)0x0;
          local_548 = (code *)0x20;
          local_538 = 0x20;
          FUN_10015dbf0(&local_530);
          goto LAB_1000ef7bc;
        }
LAB_1000ef538:
        local_548 = (code *)0xffffffffffffffff;
        puStack_540 = puStack_1d8;
        goto LAB_1000ef800;
      }
      if (*local_410 != 0x6573616261746164) goto LAB_1000eecd4;
      FUN_10015e744(&local_1e0,param_3,&local_400,pcStack_428,local_420);
      if ((local_1e0 & 1) != 0) goto LAB_1000ef538;
      local_530 = (undefined1)(local_1e0 >> 8);
      uStack_52f = (undefined1)(local_1e0 >> 0x10);
      uStack_52e = (undefined1)(local_1e0 >> 0x18);
      uStack_52d = local_1e0._4_4_;
      pcStack_a8 = pcStack_1c8;
      local_b0 = local_1d0;
      local_a0 = local_1c0._0_1_;
      uStack_529 = SUB81(puStack_1d8,0);
      uStack_528._0_4_ = (undefined4)((ulong)puStack_1d8 >> 8);
      uStack_528._4_3_ = (undefined3)((ulong)puStack_1d8 >> 0x28);
      uStack_520._7_1_ = SUB81(pcStack_1c8,0);
      uStack_518 = (undefined7)((ulong)pcStack_1c8 >> 8);
      uStack_528._7_1_ = SUB81(local_1d0,0);
      uStack_520._0_4_ = (undefined4)((ulong)local_1d0 >> 8);
      uStack_520._4_3_ = (undefined3)((ulong)local_1d0 >> 0x28);
      uStack_511 = local_1c0._0_1_;
      __rustc[3d2f79520d6fa809]::__rust_no_alloc_shim_is_unstable_v2();
      puStack_540 = (undefined8 *)__rustc[3d2f79520d6fa809]::__rust_alloc(0x20,1);
      if (puStack_540 == (undefined8 *)0x0) {
                    /* WARNING: Subroutine does not return */
        alloc[654f9ea51da0cd84]::raw_vec::handle_error(1,0x20);
      }
      puStack_540[1] = CONCAT44(uStack_528._4_4_,(undefined4)uStack_528);
      *puStack_540 = CONCAT17(uStack_529,
                              CONCAT43(uStack_52d,
                                       CONCAT12(uStack_52e,CONCAT11(uStack_52f,local_530))));
      puStack_540[3] = CONCAT17(uStack_511,uStack_518);
      puStack_540[2] = CONCAT44(uStack_520._4_4_,(undefined4)uStack_520);
      local_548 = (code *)0x20;
      local_538 = 0x20;
      FUN_10015dbf0(&local_530);
LAB_1000ef7bc:
      if (local_548 == (code *)0xffffffffffffffff) goto LAB_1000ef800;
      param_1[0x12] = puStack_540;
      param_1[0x11] = local_548;
      param_1[0x13] = local_538;
      param_1[0x47] = uVar30;
      *param_1 = 0xffffffffffffffff;
      *(undefined4 *)(param_1 + 0x48) = 2;
      param_1[0x10] = 0x8000000000000022;
LAB_1000ef844:
      if (uVar26 != 0) {
        __rustc[3d2f79520d6fa809]::__rust_dealloc(local_3f8,uVar26,1);
      }
      if (uStack_3e8 != 0) {
        __rustc[3d2f79520d6fa809]::__rust_dealloc(local_3e0,uStack_3e8,1);
      }
    }
    pcVar2 = local_418;
    puVar35 = local_410;
    if (local_430 != (undefined8 *)0x0) {
      __rustc[3d2f79520d6fa809]::__rust_dealloc(pcStack_428,local_430,1);
      pcVar2 = local_418;
      puVar35 = local_410;
    }
    goto joined_r0x0001000ef1fc;
  case 0x26:
    puStack_1d8 = (undefined8 *)param_2[2];
    local_1e0 = param_2[1];
    pcStack_1c8 = (code *)param_2[4];
    local_1d0 = (undefined8 *)param_2[3];
    uStack_1b8 = param_2[6];
    local_1c0 = (ulong *)param_2[5];
    pbStack_1a8 = (byte *)param_2[8];
    local_1b0 = param_2[7];
    FUN_10015bd84(&local_430,&local_1e0,&DAT_100631987,0x20,&DAT_1006319a7,10,0);
    if (local_430 == (undefined8 *)0xffffffffffffffff) {
      FUN_100106bcc(param_1,uVar30,&DAT_100631962,0x25,&DAT_10062cb20,8,0);
      if (local_430 == (undefined8 *)0xffffffffffffffff) {
        FUN_1000f224c(&local_430);
      }
    }
    else {
      _memcpy(param_1 + 0x11,&local_430,0x118);
      param_1[0x47] = uVar30;
      *param_1 = 0xffffffffffffffff;
      *(undefined4 *)(param_1 + 0x48) = 2;
      param_1[0x10] = 0x8000000000000026;
    }
    pcVar2 = pcStack_1c8;
    puVar35 = local_1c0;
    if (local_1e0 != 0) {
      __rustc[3d2f79520d6fa809]::__rust_dealloc(puStack_1d8,local_1e0,1);
      pcVar2 = pcStack_1c8;
      puVar35 = local_1c0;
    }
joined_r0x0001000ef1fc:
    if (pcVar2 != (code *)0x0) {
      __rustc[3d2f79520d6fa809]::__rust_dealloc(puVar35,pcVar2,1);
    }
LAB_1000ef9cc:
    uVar26 = param_2[0x3b];
  }
  if (uVar26 != 0xffffffffffffffff) {
    if (uVar26 != 0) {
      __rustc[3d2f79520d6fa809]::__rust_dealloc(param_2[0x3c],uVar26,1);
    }
    if (param_2[0x3e] != 0) {
      __rustc[3d2f79520d6fa809]::__rust_dealloc(param_2[0x3f],param_2[0x3e],1);
    }
  }
  uVar26 = *param_2;
  if (uVar26 != 0xffffffffffffffff) {
    uVar30 = uVar26 - 2;
    if (uVar26 < 2) {
      uVar30 = 0x25;
    }
    if ((0x26 < uVar30) || ((0x46010208e0U >> (uVar30 & 0x3f) & 1) == 0)) {
LAB_1000efa54:
      FUN_1000fdfc0(param_2);
    }
  }
  return;
}

