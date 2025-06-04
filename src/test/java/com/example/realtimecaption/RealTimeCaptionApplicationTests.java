package com.example.realtimecaption;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.concurrent.*;

@SpringBootTest
class RealTimeCaptionApplicationTests {

    @Test
    void contextLoads() {
    }

    static class Mul implements Callable<Integer> {

        int a;
        int b;
        Mul(int a,int b){
            this.a=a;
            this.b=b;
        }

        @Override
        public Integer call() throws Exception {
            return a*b;
        }
    }

    class demo1 extends Thread{
        @Override
        public void run() {

        }

    }
    @Test
    void test1() throws ExecutionException, InterruptedException {
        Mul task1=new Mul(2,22);
        Mul task2=new Mul(3,32);
        Thread t1=new Thread(new FutureTask<>(task1));
        Thread t2=new Thread(new FutureTask<>(task2));
        ExecutorService executorService= Executors.newFixedThreadPool(2);
        Future futureTask1=executorService.submit(task1);
        Future futureTask2=executorService.submit(task2);
        System.out.println(futureTask1.get());
    }

}

