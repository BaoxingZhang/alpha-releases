
void FUN_1001f4ae0(undefined2 *param_1)

{
  int local_2c;
  long local_28;
  
  local_28 = *(long *)PTR____stack_chk_guard_1007c41d0;
  FUN_100214bec(&local_2c);
  if (local_2c < 0) {
    *param_1 = 0;
    *(undefined8 *)(param_1 + 4) = 0;
    *(undefined8 *)(param_1 + 8) = 0;
  }
  else {
    FUN_1001fe324(param_1);
  }
  FUN_100214c2c(&local_2c);
  if (*(long *)PTR____stack_chk_guard_1007c41d0 == local_28) {
    return;
  }
                    /* WARNING: Subroutine does not return */
  ___stack_chk_fail();
}

